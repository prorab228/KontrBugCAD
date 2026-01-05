class HistoryManager {
    constructor(cadEditor, maxSize = 50) {
        this.editor = cadEditor;  // Добавляем ссылку на редактор
        this.history = [];
        this.currentIndex = -1;
        this.maxSize = maxSize;
    }

    addAction(action) {
        console.log('History addAction:', action.type, action);

        // Удаляем все действия после текущего индекса
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Для действий трансформации сохраняем предыдущее состояние
        if (action.type.startsWith('modify_') && action.object) {
            const obj = this.editor.findObjectByUuid(action.object);
            if (obj) {
                if (!action.data) action.data = {};

                switch(action.type) {
                    case 'modify_position':
                        if (!action.data.previousPosition) {
                            action.data.previousPosition = obj.position.toArray();
                        }
                        break;
                    case 'modify_rotation':
                        if (!action.data.previousRotation) {
                            const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, 'XYZ');
                            action.data.previousRotation = [euler.x, euler.y, euler.z];
                        }
                        break;
                    case 'modify_scale':
                        if (!action.data.previousScale) {
                            action.data.previousScale = obj.scale.toArray();
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
                }
            }
        }

        // Для удаления сохраняем ПОЛНЫЕ данные объектов
        if (action.type === 'delete' && action.objects) {
            action.objects = action.objects.map(obj => {
                const fullObj = this.editor.findObjectByUuid(obj.uuid);
                if (fullObj) {
                    return {
                        uuid: fullObj.uuid,
                        data: this.editor.projectManager.serializeObjectForHistory(fullObj)
                    };
                }
                return obj;
            });
        }

        // Для булевых операций сохраняем ПОЛНЫЕ данные исходных объектов
        // В методе addAction добавьте проверку:
        if (action.type === 'boolean' && action.sourceObjects) {
            console.log('=== Saving boolean operation to history ===');
            console.log('Source objects:', action.sourceObjects);

            // Проверяем, есть ли уже originalObjects
            if (!action.originalObjects || action.originalObjects.length === 0) {
                console.log('No originalObjects provided, collecting them...');
                action.originalObjects = action.sourceObjects.map(uuid => {
                    const obj = this.editor.findObjectByUuid(uuid);
                    if (obj) {
                        console.log('Found object:', obj.uuid, obj.userData?.type);
                        const data = this.editor.projectManager.serializeObjectForHistory(obj);
                        if (data) {
                            return {
                                uuid: obj.uuid,
                                data: data
                            };
                        }
                    }
                    return null;
                }).filter(obj => obj !== null);

                console.log('Collected originalObjects:', action.originalObjects);
            }
        }

        // Добавляем действие с уникальным ID
        const newAction = {
            ...action,
            id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString()
        };

        this.history.push(newAction);

        // Ограничиваем размер истории
        if (this.history.length > this.maxSize) {
            this.history.shift();
        } else {
            this.currentIndex = this.history.length - 1;
        }

        console.log('History after add:', {
            index: this.currentIndex,
            total: this.history.length,
            lastAction: newAction
        });

        this.updateHistoryUI();
        return newAction;
    }


    // Используем метод из CADEditor для поиска объектов
    findObjectByUuid(uuid) {
        return this.editor.findObjectByUuid(uuid);
    }


    undo() {
        if (this.currentIndex >= 0) {
            const action = this.history[this.currentIndex];
            console.log('History undo:', action.type, 'index:', this.currentIndex);
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
            console.log('History redo:', action.type, 'index:', this.currentIndex);
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