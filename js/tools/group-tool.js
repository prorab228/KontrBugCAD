// js/tools/group-tool.js (исправленная версия без дубликатов)
class GroupTool extends Tool {
    constructor(editor) {
        super('group', 'fa-object-group', editor);
        this.requiresSelection = true;
        this.minObjects = 2;
    }

    onActivate() {
        if (!this.canActivate()) {
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        if (this.editor.selectedObjects.length < this.minObjects) {
            this.editor.showStatus(`Для группировки нужно выбрать минимум ${this.minObjects} объекта`, 'error');
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        // Выполняем группировку
        this.performGrouping();

        // Возвращаемся к инструменту выделения
        setTimeout(() => {
            this.editor.toolManager.restorePreviousTool();
        }, 100);
    }

    performGrouping() {
        const selectedObjects = this.editor.selectedObjects.slice();

        // Фильтруем объекты
        const filteredObjects = selectedObjects.filter(obj => {
            if (obj.userData?.type === 'group') {
                this.editor.showStatus('Объекты групп не могут быть сгруппированы', 'warning');
                return false;
            }
            return true;
        });

        if (filteredObjects.length < 2) {
            this.editor.showStatus('Недостаточно объектов для группировки', 'error');
            return;
        }

        // Сохраняем мировые позиции объектов
        const worldPositions = filteredObjects.map(obj => {
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            return {
                object: obj,
                worldPosition: worldPos.clone(),
                originalParent: obj.parent
            };
        });

        // Вычисляем среднюю позицию
        const avgPosition = new THREE.Vector3();
        worldPositions.forEach(item => {
            avgPosition.add(item.worldPosition);
        });
        avgPosition.divideScalar(worldPositions.length);

        // Создаем группу в средней позиции
        const group = new THREE.Group();
        group.name = `Group_${Date.now()}`;
        group.position.copy(avgPosition);

        // Добавляем объекты в группу с корректировкой позиций
        worldPositions.forEach(item => {
            const obj = item.object;
            const relativePos = item.worldPosition.clone().sub(avgPosition);

            // Удаляем из текущего родителя
            if (obj.parent) {
                obj.parent.remove(obj);
            }

            // Добавляем в группу
            group.add(obj);

            // Устанавливаем относительную позицию
            obj.position.copy(relativePos);
        });

        // Настраиваем пользовательские данные
        group.userData.type = 'group';
        group.userData.id = `group_${Date.now()}`;
        group.userData.name = `Группа (${filteredObjects.length} объектов)`;
        group.userData.createdAt = new Date().toISOString();
        group.userData.childCount = filteredObjects.length;
        group.userData.isGroup = true;
        group.userData.expanded = true;
        group.userData.originalObjects = worldPositions.map(item => ({
            uuid: item.object.uuid,
            worldPosition: item.worldPosition.toArray(),
            parentUuid: item.originalParent ? item.originalParent.uuid : null
        }));

        // Обновляем трансформации
        group.updateMatrixWorld(true);

        // Удаляем объекты из основного массива
        filteredObjects.forEach(obj => {
            const index = this.editor.objects.indexOf(obj);
            if (index > -1) {
                this.editor.objects.splice(index, 1);
            }
        });

        // Добавляем группу в сцену
        this.editor.objectsGroup.add(group);
        this.editor.objects.push(group);

        // Добавляем в массив групп
        if (!this.editor.groups) {
            this.editor.groups = [];
        }
        this.editor.groups.push(group);

        // Добавляем действие в историю
        this.addToHistory(filteredObjects, group);

        // Выделяем группу
        this.editor.clearSelection();
        this.editor.selectObject(group);

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();

        this.editor.showStatus(`Объекты сгруппированы (${filteredObjects.length} шт.)`, 'success');
    }

    addToHistory(originalObjects, group) {
        const originalData = originalObjects.map(obj => {
            // Получаем мировые трансформации
            obj.updateMatrixWorld(true);
            const worldMatrix = obj.matrixWorld.clone();

            // Создаем клон с мировыми трансформациями
            const clone = obj.clone();

            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            worldMatrix.decompose(worldPos, worldQuat, worldScale);

            clone.position.copy(worldPos);
            clone.quaternion.copy(worldQuat);
            clone.scale.copy(worldScale);
            clone.userData = { ...obj.userData };

            return {
                uuid: obj.uuid,
                data: this.editor.projectManager.serializeObjectForHistory(clone),
                parentUuid: obj.parent ? obj.parent.uuid : null
            };
        });

        const groupData = this.editor.projectManager.serializeObjectForHistory(group);

        const action = {
            type: 'group',
            groupUuid: group.uuid,
            groupData: groupData,
            originalObjects: originalData,
            timestamp: new Date().toISOString()
        };

        this.editor.history.addAction(action);
    }

    onDeactivate() {
        // Ничего особенного не нужно
    }
}