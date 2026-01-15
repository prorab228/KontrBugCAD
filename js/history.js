class HistoryManager {
    constructor(cadEditor, maxSize = 50) {
        this.editor = cadEditor;
        this.history = [];
        this.currentIndex = -1;
        this.maxSize = maxSize;
    }

    // ДОБАВЛЕНИЕ ДЕЙСТВИЯ
    addAction(action) {
        console.log('=== History addAction ===', action.type, action);

        // Удаляем действия после текущего индекса
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Улучшаем данные действия
        const enhancedAction = this.enhanceActionData(action);

        // Добавляем с уникальным ID
        const newAction = {
            ...enhancedAction,
            id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString()
        };

        this.history.push(newAction);

        // Ограничиваем размер
        if (this.history.length > this.maxSize) {
            this.history.shift();
        } else {
            this.currentIndex = this.history.length - 1;
        }

        console.log('History state:', {
            index: this.currentIndex,
            total: this.history.length,
            lastAction: newAction.type
        });

        this.updateHistoryUI();
        return newAction;
    }

    // УЛУЧШЕНИЕ ДАННЫХ ДЕЙСТВИЯ
    enhanceActionData(action) {
        switch (action.type) {
            case 'create':
                return this.enhanceCreateAction(action);
            case 'delete':
                return this.enhanceDeleteAction(action);
            case 'boolean':
                return this.enhanceBooleanAction(action);
            case 'modify_position':
            case 'modify_scale':
            case 'modify_rotation':
            case 'modify_size':
                return this.enhanceModifyAction(action);
            case 'modify_position_multiple':
                return this.enhanceMultipleModifyAction(action);
            case 'import':
                return this.enhanceImportAction(action);
            case 'group':
                return this.enhanceGroupAction(action);
            case 'ungroup':
                return this.enhanceUngroupAction(action);
            // ДОБАВЛЯЕМ ДЛЯ СКЕТЧА
            case 'sketch_add':
            case 'sketch_delete':
                return this.enhanceSketchAction(action);
            default:
                return action;
        }
    }

    // Улучшение данных для скетча
    enhanceSketchAction(action) {
        // Если есть sketchPlaneId, получаем данные скетча с плоскости
        if (action.sketchPlaneId && this.editor.objectsManager) {
            const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
            if (plane && plane.userData && (plane.userData.hasSketch || plane.userData.type === 'sketch_plane')) {
                // Сохраняем полное состояние скетча с этой плоскости
                action.sketchData = this.serializeSketchState(plane);
            }
        }

        // Если есть элементы, сериализуем их
        if (action.elements && Array.isArray(action.elements) && this.editor.projectManager) {
            action.elements = action.elements.map(elementData => {
                // Если элемент уже сериализован, возвращаем как есть
                if (elementData.data) return elementData;

                // Иначе сериализуем
                const element = this.editor.findObjectByUuid(elementData.uuid);
                if (element) {
                    return {
                        uuid: element.uuid,
                        data: this.editor.projectManager.serializeObjectForHistory(element)
                    };
                }
                return elementData;
            });
        }

        return action;
    }

    // Сериализация состояния скетча
    serializeSketchState(plane) {
        const sketchData = {
            planeId: plane.uuid,
            planeData: this.editor.projectManager.serializeObject(plane),
            elements: []
        };

        // Собираем все элементы скетча с этой плоскости
        plane.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const elementData = this.editor.projectManager.serializeObjectForHistory(child);
                if (elementData) {
                    sketchData.elements.push({
                        uuid: child.uuid,
                        data: elementData
                    });
                }
            }
        });

        return sketchData;
    }

    enhanceMultipleModifyAction(action) {
        if (!action.objects || !Array.isArray(action.objects)) {
            return action;
        }

        // Сохраняем предыдущие состояния всех объектов
        const enhancedObjects = action.objects.map(objData => {
            const obj = this.editor.findObjectByUuid(objData.uuid);
            if (!obj) return objData;

            const enhancedData = { ...objData };
            // Сохраняем предыдущее состояние в зависимости от типа операции

            if (!enhancedData.previousPosition) {
                enhancedData.previousPosition = obj.position.toArray();
            }

            return enhancedData;
        });

        return {
            ...action,
            objects: enhancedObjects
        };
    }

    enhanceCreateAction(action) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (obj && this.editor.projectManager) {
            return {
                ...action,
                data: this.editor.projectManager.serializeObjectForHistory(obj)
            };
        }
        return action;
    }

    enhanceDeleteAction(action) {
        if (!action.objects || !Array.isArray(action.objects)) return action;

        const enhancedObjects = action.objects.map(objData => {
            const obj = this.editor.findObjectByUuid(objData.uuid);
            if (obj && this.editor.projectManager) {
                return {
                    uuid: obj.uuid,
                    data: this.editor.projectManager.serializeObjectForHistory(obj)
                };
            }
            return objData;
        });

        return { ...action, objects: enhancedObjects };
    }

    enhanceBooleanAction(action) {
        console.log('=== Enhancing boolean action ===');

        // Сохраняем полные данные исходных объектов
        if (action.sourceObjects && !action.originalObjects) {
            action.originalObjects = action.sourceObjects.map(uuid => {
                const obj = this.editor.findObjectByUuid(uuid);
                if (obj && this.editor.projectManager) {
                    console.log('Saving original object:', obj.uuid, obj.userData?.type);
                    const data = this.editor.projectManager.serializeObjectForHistory(obj);
                    return { uuid: obj.uuid, data: data };
                }
                return null;
            }).filter(obj => obj !== null);
        }

        // Сохраняем результат операции
        if (!action.resultData && action.result) {
            const resultObj = this.editor.findObjectByUuid(action.result);
            if (resultObj && this.editor.projectManager) {
                action.resultData = this.editor.projectManager.serializeObjectForHistory(resultObj);
            }
        }

        return action;
    }

    enhanceModifyAction(action) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj) return action;

        // Сохраняем предыдущее состояние
        if (!action.data.previousPosition && action.type === 'modify_position') {
            action.data.previousPosition = obj.position.toArray();
        }
        if (!action.data.previousScale && action.type === 'modify_scale') {
            action.data.previousScale = obj.scale.toArray();
        }
        if (!action.data.previousRotation && action.type === 'modify_rotation') {
            const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, 'XYZ');
            action.data.previousRotation = [euler.x, euler.y, euler.z];
        }
        if (!action.data.previousDimensions && action.type === 'modify_size') {
            const dimensions = this.editor.objectsManager.getObjectDimensions(obj);
            action.data.previousDimensions = {
                x: dimensions.x,
                y: dimensions.y,
                z: dimensions.z
            };
        }

        return action;
    }

    enhanceImportAction(action) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (obj && this.editor.projectManager) {
            return {
                ...action,
                data: this.editor.projectManager.serializeObjectForHistory(obj)
            };
        }
        return action;
    }

    enhanceGroupAction(action) {
        // Улучшаем данные группы
        const group = this.editor.findObjectByUuid(action.groupUuid);
        if (group && this.editor.projectManager) {
            return {
                ...action,
                groupData: this.editor.projectManager.serializeObjectForHistory(group)
            };
        }
        return action;
    }

    enhanceUngroupAction(action) {
        // Улучшаем данные разгруппированных объектов
        if (action.ungroupedObjects && Array.isArray(action.ungroupedObjects)) {
            const enhancedObjects = action.ungroupedObjects.map(objData => {
                const obj = this.editor.findObjectByUuid(objData.uuid);
                if (obj && this.editor.projectManager) {
                    return {
                        ...objData,
                        data: this.editor.projectManager.serializeObjectForHistory(obj)
                    };
                }
                return objData;
            });

            return {
                ...action,
                ungroupedObjects: enhancedObjects
            };
        }
        return action;
    }

    // ОТМЕНА И ПОВТОР
    undo() {
        if (this.currentIndex < 0) return false;

        const action = this.history[this.currentIndex];
        console.log('=== History undo ===', action.type);

        try {
            this.applyAction(action, true);
            this.currentIndex--;
            this.updateHistoryUI();
            return true;
        } catch (error) {
            console.error('Undo failed:', error);
            return false;
        }
    }

    redo() {
        if (this.currentIndex >= this.history.length - 1) return false;

        this.currentIndex++;
        const action = this.history[this.currentIndex];
        console.log('=== History redo ===', action.type);

        try {
            this.applyAction(action, false);
            this.updateHistoryUI();
            return true;
        } catch (error) {
            console.error('Redo failed:', error);
            this.currentIndex--;
            return false;
        }
    }

    // ПРИМЕНЕНИЕ ДЕЙСТВИЯ
    applyAction(action, isUndo) {
        console.log('Applying action:', { type: action.type, isUndo });

        switch (action.type) {
            case 'create':
                return isUndo ? this.undoCreate(action) : this.redoCreate(action);
            case 'delete':
                return isUndo ? this.undoDelete(action) : this.redoDelete(action);
            case 'boolean':
                return isUndo ? this.undoBoolean(action) : this.redoBoolean(action);
            case 'modify_position':
                return this.applyModifyPosition(action, isUndo);
            case 'modify_scale':
                return this.applyModifyScale(action, isUndo);
            case 'modify_rotation':
                return this.applyModifyRotation(action, isUndo);
            case 'modify_size':
                return this.applyModifySize(action, isUndo);
            case 'modify_color':
                return this.applyModifyColor(action, isUndo);
            case 'modify_opacity':
                return this.applyModifyOpacity(action, isUndo);
            case 'modify_position_multiple':
                return this.applyModifyPositionMultiple(action, isUndo);
            case 'import':
                return isUndo ? this.undoImport(action) : this.redoImport(action);
            case 'group':
                return isUndo ? this.undoGroup(action) : this.redoGroup(action);
            case 'ungroup':
                return isUndo ? this.undoUngroup(action) : this.redoUngroup(action);
            // ДОБАВЛЯЕМ ДЛЯ СКЕТЧА
            case 'sketch_add':
                return isUndo ? this.undoSketchAdd(action) : this.redoSketchAdd(action);
            case 'sketch_delete':
                return isUndo ? this.undoSketchDelete(action) : this.redoSketchDelete(action);
            default:
                console.warn('Unknown action type:', action.type);
                return false;
        }
    }

    // МЕТОДЫ ДЛЯ СКЕТЧА
    // В методе undoSketchAdd
    undoSketchAdd(action) {
        console.log('Undoing sketch add action');

        // Удаляем добавленные элементы
        if (action.elements && Array.isArray(action.elements)) {
            action.elements.forEach(elementData => {
                const element = this.editor.findObjectByUuid(elementData.uuid);
                if (element) {
                    // Удаляем из менеджера элементов
                    if (this.editor.sketchManager &&
                        this.editor.sketchManager.elementManager) {
                        this.editor.sketchManager.elementManager.removeElementFromArrays(element);
                    }

                    this.removeSketchElement(element);
                }
            });
        }

        // Восстанавливаем предыдущее состояние скетча, если есть
        if (action.previousSketchState) {
            this.restoreSketchState(action.previousSketchState);
        }

        // Обновляем состояние менеджера элементов
        if (action.sketchPlaneId && this.editor.sketchManager) {
            const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
            if (plane) {
                this.editor.sketchManager.elementManager.updateElementsFromPlane();
                this.editor.sketchManager.elementManager.clearSelection();
            }
        }

        // Обновляем контуры после отмены
        if (action.sketchPlaneId && this.editor.sketchManager) {
            const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
            if (plane) {
                this.editor.sketchManager.contourManager.detectContoursInSketch(plane);
            }
        }

        return true;
    }

    // В методе redoSketchAdd
    redoSketchAdd(action) {
        console.log('Redoing sketch add action');

        // Добавляем элементы обратно
        if (action.elements && Array.isArray(action.elements)) {
            let addedCount = 0;
            action.elements.forEach(elementData => {
                if (elementData.data && this.editor.projectManager) {
                    const element = this.editor.projectManager.deserializeObjectOptimized(elementData.data);
                    if (element && action.sketchPlaneId) {
                        const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
                        if (plane) {
                            plane.add(element);

                            // Добавляем в менеджер элементов
                            if (this.editor.sketchManager &&
                                this.editor.sketchManager.elementManager) {
                                const elementObj = {
                                    type: element.userData.elementType,
                                    mesh: element,
                                    originalColor: element.userData.originalColor,
                                    color: element.userData.originalColor,
                                    localPoints: element.userData.localPoints,
                                    localPosition: element.userData.localPosition,
                                    isClosed: element.userData.isClosed,
                                    sketchPlaneId: element.userData.sketchPlaneId,
                                    userData: element.userData
                                };
                                this.editor.sketchManager.elementManager.elements.push(elementObj);
                            }

                            addedCount++;
                        }
                    }
                }
            });

            // Обновляем контуры после повтора
            if (action.sketchPlaneId && this.editor.sketchManager && addedCount > 0) {
                const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
                if (plane) {
                    this.editor.sketchManager.contourManager.detectContoursInSketch(plane);
                }
            }

            return addedCount > 0;
        }
        return false;
    }

    // В методе undoSketchDelete
    undoSketchDelete(action) {
        console.log('Undoing sketch delete action');

        // Восстанавливаем удаленные элементы
        if (action.elements && Array.isArray(action.elements)) {
            let restoredCount = 0;
            action.elements.forEach(elementData => {
                if (elementData.data && this.editor.projectManager) {
                    const element = this.editor.projectManager.deserializeObjectOptimized(elementData.data);
                    if (element && action.sketchPlaneId) {
                        const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
                        if (plane) {
                            plane.add(element);

                            // Добавляем в менеджер элементов
                            if (this.editor.sketchManager &&
                                this.editor.sketchManager.elementManager) {
                                const elementObj = {
                                    type: element.userData.elementType,
                                    mesh: element,
                                    originalColor: element.userData.originalColor,
                                    color: element.userData.originalColor,
                                    localPoints: element.userData.localPoints,
                                    localPosition: element.userData.localPosition,
                                    isClosed: element.userData.isClosed,
                                    sketchPlaneId: element.userData.sketchPlaneId,
                                    userData: element.userData
                                };
                                this.editor.sketchManager.elementManager.elements.push(elementObj);
                            }

                            restoredCount++;
                        }
                    }
                }
            });

            // Обновляем контуры после отмены удаления
            if (action.sketchPlaneId && this.editor.sketchManager && restoredCount > 0) {
                const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
                if (plane) {
                    this.editor.sketchManager.contourManager.detectContoursInSketch(plane);
                }
            }

            return restoredCount > 0;
        }
        return false;
    }

    // В методе redoSketchDelete
    redoSketchDelete(action) {
        console.log('Redoing sketch delete action');

        // Удаляем элементы снова
        if (action.elements && Array.isArray(action.elements)) {
            let deletedCount = 0;
            action.elements.forEach(elementData => {
                const element = this.editor.findObjectByUuid(elementData.uuid);
                if (element) {
                    // Удаляем из менеджера элементов
                    if (this.editor.sketchManager &&
                        this.editor.sketchManager.elementManager) {
                        this.editor.sketchManager.elementManager.removeElementFromArrays(element);
                    }

                    this.removeSketchElement(element);
                    deletedCount++;
                }
            });

            // Обновляем контуры после повтора удаления
            if (action.sketchPlaneId && this.editor.sketchManager && deletedCount > 0) {
                const plane = this.editor.findObjectByUuid(action.sketchPlaneId);
                if (plane) {
                    this.editor.sketchManager.contourManager.detectContoursInSketch(plane);
                }
            }

            return deletedCount > 0;
        }
        return false;
    }

    // Вспомогательный метод для удаления элемента скетча
    removeSketchElement(element) {
        if (element.parent) {
            element.parent.remove(element);
        }

        // Освобождаем ресурсы
        if (element.geometry) element.geometry.dispose();
        if (element.material) element.material.dispose();
    }

    // Восстановление состояния скетча
    restoreSketchState(sketchState) {
        if (!sketchState || !sketchState.planeId) return false;

        const plane = this.editor.findObjectByUuid(sketchState.planeId);
        if (!plane) return false;

        // Удаляем текущие элементы
        for (let i = plane.children.length - 1; i >= 0; i--) {
            const child = plane.children[i];
            if (child.userData && child.userData.type === 'sketch_element') {
                plane.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
        }

        // Восстанавливаем элементы
        if (sketchState.elements && Array.isArray(sketchState.elements)) {
            sketchState.elements.forEach(elementData => {
                if (elementData.data && this.editor.projectManager) {
                    const element = this.editor.projectManager.deserializeObjectOptimized(elementData.data);
                    if (element) {
                        plane.add(element);
                    }
                }
            });
        }

        return true;
    }

    applyModifyPositionMultiple(action, isUndo) {
        if (!action.objects || !Array.isArray(action.objects)) {
            return false;
        }

        let successCount = 0;
        action.objects.forEach(objData => {
            const obj = this.editor.findObjectByUuid(objData.uuid);
            if (obj) {
                if (isUndo) {
                    obj.position.fromArray(objData.previousPosition || [0, 0, 0]);
                } else {
                    obj.position.fromArray(objData.position || [0, 0, 0]);
                }
                successCount++;
            }
        });

        this.editor.updatePropertiesPanel();
        return successCount > 0;
    }

    // ОПЕРАЦИИ СОЗДАНИЯ
    undoCreate(action) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj) return false;

        this.removeObjectFromScene(obj);
        return true;
    }

    redoCreate(action) {
        if (!action.data || !this.editor.projectManager) return false;

        const obj = this.editor.projectManager.deserializeObject(action.data);
        if (!obj) return false;

        this.addObjectToScene(obj, true);
        return true;
    }

    // ОПЕРАЦИИ УДАЛЕНИЯ
    undoDelete(action) {
        if (!action.objects || !Array.isArray(action.objects)) return false;

        let restoredCount = 0;
        action.objects.forEach(objData => {
            if (!objData.data || !this.editor.projectManager) return;

            const obj = this.editor.projectManager.deserializeObject(objData.data);
            if (obj) {
                this.addObjectToScene(obj, false);
                restoredCount++;
            }
        });

        return restoredCount > 0;
    }

    redoDelete(action) {
        if (!action.objects || !Array.isArray(action.objects)) return false;

        let deletedCount = 0;
        action.objects.forEach(objData => {
            const obj = this.editor.findObjectByUuid(objData.uuid);
            if (obj) {
                this.removeObjectFromScene(obj);
                deletedCount++;
            }
        });

        return deletedCount > 0;
    }

    // БУЛЕВЫ ОПЕРАЦИИ
    undoBoolean(action) {
        console.log('Undoing boolean operation:', action.operation);

        // Удаляем результат
        const resultObj = this.editor.findObjectByUuid(action.result);
        if (resultObj) {
            this.removeObjectFromScene(resultObj);
        }

        // Восстанавливаем исходные объекты
        if (action.originalObjects && Array.isArray(action.originalObjects)) {
            action.originalObjects.forEach(objData => {
                if (!objData.data || !this.editor.projectManager) return;

                const obj = this.editor.projectManager.deserializeObject(objData.data);
                if (obj) {
                    this.addObjectToScene(obj, false);
                }
            });
        }

        return true;
    }

    redoBoolean(action) {
        console.log('Redoing boolean operation:', action.operation);

        // Удаляем исходные объекты
        if (action.sourceObjects && Array.isArray(action.sourceObjects)) {
            action.sourceObjects.forEach(uuid => {
                const obj = this.editor.findObjectByUuid(uuid);
                if (obj) {
                    this.removeObjectFromScene(obj);
                }
            });
        }

        // Создаем результат
        if (action.resultData && this.editor.projectManager) {
            const resultObj = this.editor.projectManager.deserializeObject(action.resultData);
            if (resultObj) {
                this.addObjectToScene(resultObj, true);
                this.editor.selectObject(resultObj);
                return true;
            }
        }

        return false;
    }

    // ИЗМЕНЕНИЯ СВОЙСТВ
    applyModifyPosition(action, isUndo) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj) return false;

        if (isUndo) {
            obj.position.fromArray(action.data.previousPosition);
        } else {
            obj.position.fromArray(action.data.position);
        }

        this.editor.updatePropertiesPanel();
        return true;
    }

    applyModifyScale(action, isUndo) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj) return false;

        if (isUndo) {
            obj.scale.fromArray(action.data.previousScale);
        } else {
            obj.scale.fromArray(action.data.scale);
        }

        this.editor.updatePropertiesPanel();
        return true;
    }

    applyModifyRotation(action, isUndo) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj) return false;

        if (isUndo) {
            obj.rotation.fromArray(action.data.previousRotation);
        } else {
            obj.rotation.fromArray(action.data.rotation);
        }

        this.editor.updatePropertiesPanel();
        return true;
    }

    applyModifySize(action, isUndo) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj) return false;

        if (this.editor.transformControls) {
            if (isUndo) {
                this.editor.transformControls.updateObjectSizeDirect(
                    obj,
                    action.data.previousDimensions
                );
            } else {
                this.editor.transformControls.updateObjectSizeDirect(
                    obj,
                    action.data.dimensions
                );
            }
        }

        this.editor.updatePropertiesPanel();
        this.editor.objectsManager.updateSceneStats();
        return true;
    }

    applyModifyColor(action, isUndo) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj || !obj.material) return false;

        if (isUndo) {
            this.editor.setObjectColor(obj, action.data.previousColor);
        } else {
            this.editor.setObjectColor(obj, action.data.color);
        }

        this.editor.updatePropertiesPanel();
        return true;
    }

    applyModifyOpacity(action, isUndo) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj || !obj.material) return false;

        if (isUndo) {
            this.editor.setObjectOpacity(obj, action.data.previousOpacity);
        } else {
            this.editor.setObjectOpacity(obj, action.data.opacity);
        }

        this.editor.updatePropertiesPanel();
        return true;
    }

    // ИМПОРТ
    undoImport(action) {
        const obj = this.editor.findObjectByUuid(action.object);
        if (!obj) return false;

        this.removeObjectFromScene(obj);
        return true;
    }

    redoImport(action) {
        if (!action.data || !this.editor.projectManager) return false;

        const obj = this.editor.projectManager.deserializeObject(action.data);
        if (!obj) return false;

        this.addObjectToScene(obj, true);
        this.editor.selectObject(obj);
        return true;
    }

    // ГРУППИРОВКА
    undoGroup(action) {
        // Удаляем группу
        const group = this.editor.findObjectByUuid(action.groupUuid);
        if (group) {
            this.removeGroupFromScene(group);
        }

        // Восстанавливаем исходные объекты
        let restoredCount = 0;
        if (action.originalObjects && Array.isArray(action.originalObjects)) {
            action.originalObjects.forEach(objData => {
                if (objData.data && this.editor.projectManager) {
                    const obj = this.editor.projectManager.deserializeObject(objData.data);
                    if (obj) {
                        // Восстанавливаем родителя если нужно
                        if (objData.parentUuid) {
                            const parent = this.editor.findObjectByUuid(objData.parentUuid);
                            if (parent) {
                                parent.add(obj);
                            } else {
                                this.editor.objectsGroup.add(obj);
                            }
                        } else {
                            this.editor.objectsGroup.add(obj);
                        }

                        // Добавляем в массив объектов
                        this.editor.objects.push(obj);
                        restoredCount++;
                    }
                }
            });
        }

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();

        return restoredCount > 0;
    }

    redoGroup(action) {
        // Удаляем исходные объекты
        if (action.originalObjects && Array.isArray(action.originalObjects)) {
            action.originalObjects.forEach(objData => {
                const obj = this.editor.findObjectByUuid(objData.uuid);
                if (obj) {
                    this.removeObjectFromScene(obj);
                }
            });
        }

        // Восстанавливаем группу
        if (action.groupData && this.editor.projectManager) {
            const group = this.editor.projectManager.deserializeObject(action.groupData);
            if (group) {
                this.addGroupToScene(group);
                return true;
            }
        }

        return false;
    }

    undoUngroup(action) {
        // Удаляем разгруппированные объекты
        if (action.ungroupedObjects && Array.isArray(action.ungroupedObjects)) {
            action.ungroupedObjects.forEach(objData => {
                const obj = this.editor.findObjectByUuid(objData.uuid);
                if (obj) {
                    this.removeObjectFromScene(obj);
                }
            });
        }

        // Восстанавливаем группу
        let restored = false;
        if (action.groupData && this.editor.projectManager) {
            const group = this.editor.projectManager.deserializeObject(action.groupData);
            if (group) {
                this.addGroupToScene(group);

                // Восстанавливаем дочерние объекты в группе
                group.traverse((child) => {
                    if (child !== group && child instanceof THREE.Object3D) {
                        // Объекты уже в группе после десериализации
                        // Обновляем их мировые матрицы
                        child.updateMatrixWorld(true);
                    }
                });

                restored = true;
            }
        }

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();

        return restored;
    }

    redoUngroup(action) {
        // Удаляем группу
        const group = this.editor.findObjectByUuid(action.groupUuid);
        if (group) {
            this.removeGroupFromScene(group);
        }

        // Восстанавливаем разгруппированные объекты
        let restoredCount = 0;
        if (action.ungroupedObjects && Array.isArray(action.ungroupedObjects)) {
            action.ungroupedObjects.forEach(objData => {
                if (objData.data && this.editor.projectManager) {
                    const obj = this.editor.projectManager.deserializeObject(objData.data);
                    if (obj) {
                        this.addObjectToScene(obj, false);
                        restoredCount++;
                    }
                }
            });
        }

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();

        return restoredCount > 0;
    }

    addGroupToScene(group) {
        this.editor.objectsGroup.add(group);
        this.editor.objects.push(group);

        // Добавляем в массив групп
        if (!this.editor.groups) {
            this.editor.groups = [];
        }
        this.editor.groups.push(group);

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();
    }

    removeGroupFromScene(group) {
        // Удаляем группу из сцены
        if (group.parent) {
            group.parent.remove(group);
        }

        // Удаляем из массива объектов
        const objIndex = this.editor.objects.indexOf(group);
        if (objIndex > -1) {
            this.editor.objects.splice(objIndex, 1);
        }

        // Удаляем из массива групп
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

        // Очищаем трансформации
        if (this.editor.transformControls &&
            this.editor.transformControls.attachedObject === group) {
            this.editor.transformControls.detach();
        }

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();
    }

    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    addObjectToScene(obj, selectObject = false) {
        this.editor.objectsGroup.add(obj);
        this.editor.objects.push(obj);

        // Добавляем в специальные массивы
        if (obj.userData.type === 'sketch_plane') {
            this.editor.sketchPlanes.push(obj);
        } else if (obj.userData.type === 'work_plane') {
            this.editor.workPlanes.push(obj);
        } else if (obj.userData.type === 'group') {
            // Добавляем в массив групп
            if (!this.editor.groups) {
                this.editor.groups = [];
            }
            this.editor.groups.push(obj);
        }

        // Выделяем объект если нужно
        if (selectObject) {
            this.editor.selectObject(obj);
        }

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();
    }

    removeObjectFromScene(obj) {
        // Удаляем из сцены
        if (obj.parent) {
            obj.parent.remove(obj);
        }

        // Удаляем из массива объектов
        const objIndex = this.editor.objects.indexOf(obj);
        if (objIndex > -1) {
            this.editor.objects.splice(objIndex, 1);
        }

        // Удаляем из выделения
        const selectedIndex = this.editor.selectedObjects.indexOf(obj);
        if (selectedIndex > -1) {
            this.editor.selectedObjects.splice(selectedIndex, 1);
        }

        // Удаляем из специальных массивов
        if (obj.userData.type === 'sketch_plane') {
            const planeIndex = this.editor.sketchPlanes.indexOf(obj);
            if (planeIndex > -1) {
                this.editor.sketchPlanes.splice(planeIndex, 1);
            }
        } else if (obj.userData.type === 'work_plane') {
            const planeIndex = this.editor.workPlanes.indexOf(obj);
            if (planeIndex > -1) {
                this.editor.workPlanes.splice(planeIndex, 1);
            }
        } else if (obj.userData.type === 'group') {
            // Удаляем из массива групп
            if (this.editor.groups) {
                const groupIndex = this.editor.groups.indexOf(obj);
                if (groupIndex > -1) {
                    this.editor.groups.splice(groupIndex, 1);
                }
            }
        }

        // Для групп рекурсивно освобождаем ресурсы дочерних объектов
        if (obj.userData.type === 'group' || obj.isGroup) {
            obj.traverse(child => {
                if (child !== obj && child.isMesh) {
                    this.safeDisposeObject(child);
                }
            });
        } else {
            // Освобождаем ресурсы
            this.safeDisposeObject(obj);
        }

        // Очищаем трансформации если нужно
        if (this.editor.transformControls &&
            this.editor.transformControls.attachedObject === obj) {
            this.editor.transformControls.detach();
        }

        // Обновляем UI
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();
        this.editor.updatePropertiesPanel();
    }

    safeDisposeObject(obj) {
        if (!obj) return;

        try {
            if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                obj.geometry.dispose();
            }

            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(material => {
                        if (material && typeof material.dispose === 'function') {
                            material.dispose();
                        }
                    });
                } else if (typeof obj.material.dispose === 'function') {
                    obj.material.dispose();
                }
            }
        } catch (error) {
            console.warn('Error disposing object:', error);
        }
    }

    // UI
    updateHistoryUI() {
        const container = document.getElementById('historyList');
        if (!container) return;

        container.innerHTML = '';

        this.history.forEach((action, index) => {
            const item = this.createHistoryItem(action, index);
            container.appendChild(item);
        });

        // Прокручиваем к последнему элементу
        container.scrollTop = container.scrollHeight;

        // Обновляем состояние кнопок
        this.updateUndoRedoButtons();
    }

    createHistoryItem(action, index) {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.dataset.index = index;

        if (index === this.currentIndex) {
            div.classList.add('active');
        }

        const { icon, text, color } = this.getActionInfo(action);
        const time = new Date(action.timestamp).toLocaleTimeString();

        div.innerHTML = `
            <div class="history-item-icon" style="color: ${color};">
                <i class="${icon}"></i>
            </div>
            <div class="history-item-content">
                <div class="history-item-title">${text}</div>
                <div class="history-item-time">${time}</div>
            </div>
        `;

        // Добавляем обработчик клика
        div.addEventListener('click', () => {
            this.jumpToHistory(index);
        });

        return div;
    }

    getActionInfo(action) {
        const actions = {
            'create': { icon: 'fas fa-plus-circle', text: 'Создание объекта', color: '#4CAF50' },
            'delete': { icon: 'fas fa-trash', text: `Удалено объектов: ${action.objects?.length || 1}`, color: '#F44336' },
            'boolean': { icon: 'fas fa-shapes', text: `Булева операция: ${action.operation}`, color: '#2196F3' },
            'import': { icon: 'fas fa-file-import', text: `Импорт: ${action.data?.userData?.filename || 'файл'}`, color: '#FF9800' },
            'modify_position': { icon: 'fas fa-arrows-alt', text: 'Перемещение', color: '#9C27B0' },
            'modify_scale': { icon: 'fas fa-expand-alt', text: 'Масштабирование', color: '#3F51B5' },
            'modify_rotation': { icon: 'fas fa-sync-alt', text: 'Вращение', color: '#00BCD4' },
            'modify_size': { icon: 'fas fa-ruler', text: 'Изменение размеров', color: '#8BC34A' },
            'modify_position_multiple': {
                icon: 'fas fa-arrows-alt',
                text: `Перемещение (${action.objects?.length || 0} объектов)`,
                color: '#9C27B0'
            },
            'modify_color': { icon: 'fas fa-palette', text: 'Изменение цвета', color: '#E91E63' },
            'modify_opacity': { icon: 'fas fa-adjust', text: 'Изменение прозрачности', color: '#795548' },
            // ДОБАВЛЯЕМ ДЛЯ СКЕТЧА
            'sketch_add': { icon: 'fas fa-drafting-compass', text: 'Добавлен элемент скетча', color: '#FF9800' },
            'sketch_delete': { icon: 'fas fa-drafting-compass', text: `Удалено элементов скетча: ${action.elements?.length || 1}`, color: '#F44336' }
        };

        return actions[action.type] || { icon: 'fas fa-history', text: action.type, color: '#757575' };
    }

    jumpToHistory(targetIndex) {
        if (targetIndex === this.currentIndex) return;

        console.log('Jumping to history index:', targetIndex);

        // Определяем направление
        if (targetIndex < this.currentIndex) {
            // Нужно отменять действия
            while (this.currentIndex > targetIndex) {
                if (!this.undo()) break;
            }
        } else {
            // Нужно повторять действия
            while (this.currentIndex < targetIndex) {
                if (!this.redo()) break;
            }
        }
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo');
        const redoBtn = document.getElementById('redo');

        if (undoBtn) {
            undoBtn.disabled = this.currentIndex < 0;
            undoBtn.title = this.currentIndex < 0 ? 'Нечего отменять' : 'Отменить';
        }

        if (redoBtn) {
            redoBtn.disabled = this.currentIndex >= this.history.length - 1;
            redoBtn.title = this.currentIndex >= this.history.length - 1 ? 'Нечего повторять' : 'Повторить';
        }
    }

    // ОЧИСТКА
    clear() {
        this.history = [];
        this.currentIndex = -1;
        this.updateHistoryUI();
    }

    // СТАТИСТИКА
    getStats() {
        return {
            totalActions: this.history.length,
            currentIndex: this.currentIndex,
            canUndo: this.currentIndex >= 0,
            canRedo: this.currentIndex < this.history.length - 1
        };
    }

    // ЭКСПОРТ/ИМПОРТ ИСТОРИИ
    exportHistory() {
        return {
            history: this.history,
            currentIndex: this.currentIndex
        };
    }

    importHistory(data) {
        if (!data || !Array.isArray(data.history)) return false;

        this.history = data.history;
        this.currentIndex = Math.min(data.currentIndex, this.history.length - 1);
        this.updateHistoryUI();
        return true;
    }
}