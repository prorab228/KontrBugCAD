// js/tools/simple-ungroup-tool.js
class UngroupTool extends Tool {
    constructor(editor) {
        super('ungroup', 'fa-object-ungroup', editor);
        this.requiresSelection = true;
    }

    onActivate() {
        if (!this.canActivate()) {
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        const selectedGroups = this.editor.selectedObjects.filter(obj =>
            obj.userData?.type === 'group'
        );

        if (selectedGroups.length === 0) {
            this.editor.showStatus('Для разгруппировки выберите группу', 'error');
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        this.performSimpleUngrouping(selectedGroups);

        setTimeout(() => {
            this.editor.toolManager.restorePreviousTool();
        }, 100);
    }

    performSimpleUngrouping(groups) {
        groups.forEach(group => {
            // Получаем мировую позицию группы
            const groupWorldPos = group.getWorldPosition(new THREE.Vector3());

            // Обрабатываем каждый дочерний объект
            [...group.children].forEach(child => {
                if (child === group) return;

                // Вычисляем мировую позицию объекта
                child.updateMatrixWorld(true);
                const worldPos = child.getWorldPosition(new THREE.Vector3());

                // Удаляем из группы
                group.remove(child);

                // Добавляем в корневой контейнер
                this.editor.objectsGroup.add(child);

                // Восстанавливаем мировую позицию
                child.position.copy(worldPos);
                child.updateMatrixWorld(true);

                // Добавляем в основной массив объектов
                this.editor.objects.push(child);
            });

            // Удаляем группу
            this.removeGroup(group);
        });

        this.editor.showStatus(`Разгруппировано ${groups.length} групп`, 'success');
    }

    removeGroup(group) {
        if (group.parent) {
            group.parent.remove(group);
        }

        const index = this.editor.objects.indexOf(group);
        if (index > -1) {
            this.editor.objects.splice(index, 1);
        }

        if (this.editor.groups) {
            const groupIndex = this.editor.groups.indexOf(group);
            if (groupIndex > -1) {
                this.editor.groups.splice(groupIndex, 1);
            }
        }
    }

    onDeactivate() {
        // Ничего особенного не нужно
    }
}