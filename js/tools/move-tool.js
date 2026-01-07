// move-tool.js - упрощенная версия
class MoveTool extends Tool {
    constructor(editor) {
        super('move', 'fa-arrows-alt', editor);
    }

    onActivate() {
        // Если уже есть выделенный объект, активируем трансформацию
        if (this.editor.selectedObjects.length === 1) {
            const obj = this.editor.selectedObjects[0];
            if (this.canTransformObject(obj)) {
                this.editor.activateTransformForSelected(obj);
                this.editor.transformControls.updateMode('translate');
                this.editor.showStatus(`Режим перемещения для выделенного объекта`, 'info');
            }
        } else {
            this.editor.showStatus(`Выберите объект для перемещения`, 'info');
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

        // Если трансформация уже активна и кликнули по gizmo
        if (this.editor.transformControls &&
            this.editor.transformControls.onMouseDown(e, this.editor.mouse)) {
            return true;
        }

        // Иначе ищем объект для выделения и трансформации
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);

            // Проверяем, можно ли трансформировать этот объект
            if (this.canTransformObject(object)) {
                // Выделяем объект и активируем трансформацию
                this.editor.selectSingleObject(object);
                this.editor.activateTransformForSelected(object);
                this.editor.transformControls.updateMode('translate');
                this.editor.showStatus(`Режим перемещения: ${object.userData?.name || 'Объект'}`, 'info');
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

        // Нельзя трансформировать рабочие плоскости и плоскости скетча
        if (object.userData.type === 'work_plane' ||
            object.userData.type === 'sketch_plane' ||
            object.userData.type === 'base_plane') {
            return false;
        }

        return true;
    }
}