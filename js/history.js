class HistoryManager {
    constructor(cadEditor, maxSize = 50) {
        this.editor = cadEditor;  // Добавляем ссылку на редактор
        this.history = [];
        this.currentIndex = -1;
        this.maxSize = maxSize;
    }

    addAction(action) {
        // Удаляем все действия после текущего индекса
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Для действий модификации сохраняем предыдущее состояние ТОЛЬКО ЕСЛИ ЕГО ЕЩЁ НЕТ
        if (['modify_position', 'modify_scale', 'modify_rotation', 'modify_size', 'modify_color', 'modify_opacity'].includes(action.type)) {
            const obj = this.findObjectByUuid(action.object);
            if (obj) {
                if (!action.data) action.data = {};

                switch(action.type) {
                    case 'modify_position':
                        if (!action.data.previousPosition) {
                            action.data.previousPosition = obj.position.toArray();
                        }
                        break;
                    case 'modify_scale':
                        if (!action.data.previousScale) {
                            action.data.previousScale = obj.scale.toArray();
                        }
                        break;
                    case 'modify_rotation':
                        if (!action.data.previousRotation) {
                            const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, 'XYZ');
                            action.data.previousRotation = [euler.x, euler.y, euler.z];
                        }
                        break;
                    case 'modify_size':
                        if (!action.data.previousDimensions) {
                            const dimensions = this.editor.objectsManager.getObjectDimensions(obj);
                            action.data.previousDimensions = {
                                x: dimensions.x,
                                y: dimensions.y,
                                z: dimensions.z
                            };
                        }
                        break;
                    case 'modify_color':
                        if (!action.data.previousColor && obj.material) {
                            action.data.previousColor = obj.material.color.getHexString();
                        }
                        break;
                    case 'modify_opacity':
                        if (!action.data.previousOpacity && obj.material) {
                            action.data.previousOpacity = obj.material.opacity;
                        }
                        break;
                }
            }
        }

        // Для действий удаления сохраняем полные данные объектов
        if (action.type === 'delete' && action.objects) {
            action.objects = action.objects.map(objData => {
                const obj = this.findObjectByUuid(objData.uuid);
                if (obj) {
                    return {
                        uuid: obj.uuid,
                        data: {
                            userData: { ...obj.userData },
                            position: obj.position.toArray(),
                            rotation: obj.rotation.toArray(),
                            scale: obj.scale.toArray(),
                            type: obj.userData.type,
                            name: obj.userData.name
                        }
                    };
                }
                return objData;
            });
        }

        // Для булевых операций сохраняем полные данные исходных объектов
        if (action.type === 'boolean' && action.sourceObjects) {
            action.originalObjects = action.sourceObjects.map(uuid => {
                const obj = this.findObjectByUuid(uuid);
                if (obj) {
                    return {
                        uuid: obj.uuid,
                        data: {
                            userData: { ...obj.userData },
                            position: obj.position.toArray(),
                            rotation: obj.rotation.toArray(),
                            scale: obj.scale.toArray(),
                            type: obj.userData.type,
                            name: obj.userData.name
                        }
                    };
                }
                return null;
            }).filter(obj => obj !== null);
        }

        // Добавляем новое действие
        this.history.push({
            ...action,
            timestamp: new Date().toISOString(),
            id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        });

        // Ограничиваем размер истории
        if (this.history.length > this.maxSize) {
            this.history.shift();
        } else {
            this.currentIndex = this.history.length - 1;
        }

        this.updateHistoryUI();
        return this.history[this.currentIndex];
    }


    // Используем метод из CADEditor для поиска объектов
    findObjectByUuid(uuid) {
        return this.editor.findObjectByUuid(uuid);
    }


    undo() {
        if (this.currentIndex >= 0) {
            const action = this.history[this.currentIndex];
            this.currentIndex--;
            this.updateHistoryUI();
            return action;
        }
        return null;
    }

    redo() {
        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            const action = this.history[this.currentIndex];
            this.updateHistoryUI();
            return action;
        }
        return null;
    }

    clear() {
        this.history = [];
        this.currentIndex = -1;
        this.updateHistoryUI();
    }

    getHistory() {
        return this.history.slice(0, this.currentIndex + 1);
    }

    updateHistoryUI() {
        const container = document.getElementById('historyList');
        if (!container) return;

        container.innerHTML = '';

        this.history.forEach((action, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';

            if (index === this.currentIndex) {
                div.style.background = '#e3f2fd';
            }

            let icon, text;
            switch (action.type) {
                case 'create':
                    icon = 'fas fa-plus-circle';
                    text = `Создан объект: ${action.data?.name || 'Объект'}`;
                    break;
                case 'delete':
                    icon = 'fas fa-trash';
                    text = `Удалено объектов: ${action.objects?.length || 1}`;
                    break;
                case 'modify':
                    icon = 'fas fa-edit';
                    text = `Изменен параметр: ${action.data?.param}`;
                    break;
                default:
                    icon = 'fas fa-history';
                    text = `Действие: ${action.type}`;
            }

            const time = new Date(action.timestamp).toLocaleTimeString();
            div.innerHTML = `
                <i class="${icon}" style="color: #666;"></i>
                <span>${text}</span>
                <span style="margin-left: auto; font-size: 12px; color: #999;">${time}</span>
            `;

            container.appendChild(div);
        });

        // Прокручиваем к последнему элементу
        container.scrollTop = container.scrollHeight;
    }
}