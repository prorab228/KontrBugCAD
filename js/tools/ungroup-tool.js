// js/tools/ungroup-tool.js (исправленная версия)
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

        this.performUngrouping(selectedGroups);

        setTimeout(() => {
            this.editor.toolManager.restorePreviousTool();
        }, 100);
    }

    performUngrouping(groups) {
        const allUngroupedObjects = [];

        groups.forEach(group => {
            // Сохраняем действие для истории ДО разгруппировки
            this.addToHistory(group);

            // Получаем мировую матрицу группы
            group.updateMatrixWorld(true);
            const groupWorldMatrix = group.matrixWorld.clone();

            // Обрабатываем каждый дочерний объект
            const childrenToUngroup = [...group.children].filter(child => child !== group);

            childrenToUngroup.forEach(child => {
                // Сохраняем текущие мировые трансформации объекта
                child.updateMatrixWorld(true);

                // Создаем мировую матрицу объекта
                const worldMatrix = new THREE.Matrix4();
                worldMatrix.copy(child.matrixWorld);

                // Удаляем из группы
                group.remove(child);

                // Добавляем в корневой контейнер
                this.editor.objectsGroup.add(child);

                // Применяем мировые трансформации к объекту
                // Теперь он находится в мировом пространстве, поэтому matrixWorld = matrix
                const newMatrix = new THREE.Matrix4();

                if (group.parent) {
                    // Если группа имела родителя, нужно учесть его трансформации
                    const parentMatrix = group.parent.matrixWorld;
                    newMatrix.copy(worldMatrix);
                } else {
                    // Группа была на верхнем уровне
                    newMatrix.copy(worldMatrix);
                }

                // Декомпозируем матрицу в позицию, вращение и масштаб
                const position = new THREE.Vector3();
                const quaternion = new THREE.Quaternion();
                const scale = new THREE.Vector3();

                newMatrix.decompose(position, quaternion, scale);

                // Устанавливаем трансформации
                child.position.copy(position);
                child.quaternion.copy(quaternion);
                child.scale.copy(scale);

                // Обновляем матрицы
                child.updateMatrix();
                child.updateMatrixWorld(true);

                // Добавляем в основной массив объектов
                if (this.editor.objects.indexOf(child) === -1) {
                    this.editor.objects.push(child);
                    allUngroupedObjects.push(child);
                }

                // Восстанавливаем пользовательские данные, если нужно
                if (child.userData) {
                    // Если объект был частью группы, убираем флаг
                    delete child.userData.isPartOfGroup;
                    if (child.userData.originalGroup) {
                        delete child.userData.originalGroup;
                    }
                }
            });

            // Удаляем группу
            this.removeGroup(group);
        });

        // Выделяем все разгруппированные объекты
        this.editor.clearSelection();
        allUngroupedObjects.forEach(obj => {
            this.editor.selectedObjects.push(obj);
            this.editor.objectsManager.highlightObject(obj);
        });

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();

        this.editor.showStatus(`Разгруппировано ${groups.length} групп (${allUngroupedObjects.length} объектов)`, 'success');
    }

    addToHistory(group) {
        // Сохраняем данные группы и всех ее детей
        const childrenData = [];

        [...group.children].forEach(child => {
            if (child === group) return;

            // Создаем клон с текущими мировыми трансформациями
            const clone = child.clone();

            // Сохраняем мировые трансформации
            child.updateMatrixWorld(true);
            const worldMatrix = child.matrixWorld.clone();

            // Создаем отдельный объект для хранения мировых трансформаций
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            worldMatrix.decompose(worldPos, worldQuat, worldScale);

            // Применяем мировые трансформации к клону
            clone.position.copy(worldPos);
            clone.quaternion.copy(worldQuat);
            clone.scale.copy(worldScale);

            // Сохраняем пользовательские данные
            clone.userData = { ...child.userData };

            childrenData.push({
                uuid: child.uuid,
                data: this.editor.projectManager.serializeObjectForHistory(clone),
                originalParentUuid: child.parent ? child.parent.uuid : null
            });
        });

        // Сохраняем данные группы
        const groupData = this.editor.projectManager.serializeObjectForHistory(group);

        // Создаем действие разгруппировки
        const action = {
            type: 'ungroup',
            groupUuid: group.uuid,
            groupData: groupData,
            childrenData: childrenData,
            timestamp: new Date().toISOString()
        };

        this.editor.history.addAction(action);
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

        // Удаляем из выделения
        const selectedIndex = this.editor.selectedObjects.indexOf(group);
        if (selectedIndex > -1) {
            this.editor.selectedObjects.splice(selectedIndex, 1);
        }
    }

    onDeactivate() {
        // Ничего особенного не нужно
    }
}