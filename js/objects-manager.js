// objects-manager.js
class ObjectsManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
    }

    getObjectDimensions(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);
        return { x: size.x, y: size.y, z: size.z };
    }

    getObjectIconAndType(obj, index) {
        let icon = 'fa-cube';
        let typeText = 'Объект';

        if (obj.userData.type === 'work_plane') {
            icon = 'fa-square';
            typeText = 'Рабочая плоскость';
        } else if (obj.userData.type === 'sketch_plane') {
            icon = 'fa-drafting-compass';
            typeText = 'Плоскость скетча';
        } else if (obj.userData.type === 'sketch_element') {
            icon = 'fa-pencil-alt';
            typeText = 'Элемент скетча';
        } else if (obj.userData.type === 'sketch') {
            icon = 'fa-drafting-compass';
            typeText = 'Скетч';
        } else if (obj.userData.type === 'extrude') {
            icon = 'fa-arrows-alt-v';
            typeText = 'Вытягивание';
        } else if (obj.userData.type) {
            typeText = obj.userData.type;
        }

        return { icon, typeText };
    }

    updateSceneStats() {
        let vertices = 0;
        let faces = 0;

        this.editor.objects.forEach(obj => {
            if (obj.isGroup) {
                obj.traverse((child) => {
                    if (child.isMesh && child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                        vertices += child.geometry.attributes.position.count || 0;
                        if (child.geometry.index) {
                            faces += child.geometry.index.count / 3;
                        } else if (child.geometry.attributes.position) {
                            faces += child.geometry.attributes.position.count / 3;
                        }
                    }
                });
            } else if (obj.isMesh && obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) {
                vertices += obj.geometry.attributes.position.count || 0;
                if (obj.geometry.index) {
                    faces += obj.geometry.index.count / 3;
                } else if (obj.geometry.attributes.position) {
                    faces += obj.geometry.attributes.position.count / 3;
                }
            }
        });

        document.getElementById('objectCount').textContent = this.editor.objects.length;
        document.getElementById('vertexCount').textContent = vertices.toLocaleString();
        document.getElementById('faceCount').textContent = faces.toLocaleString();
    }

    checkPlaneForSketchElements(planeObject) {
        if (!planeObject || !planeObject.children) return false;

        for (const child of planeObject.children) {
            if (child.userData && child.userData.type === 'sketch_element') {
                return true;
            }
        }

        return false;
    }

    updateSceneList() {
        const container = document.getElementById('sceneList');
        if (!container) return;

        container.innerHTML = '';

        this.editor.objects.forEach((obj, index) => {
            const div = document.createElement('div');
            div.className = 'scene-item';
            if (this.editor.selectedObjects.includes(obj)) {
                div.classList.add('selected');
            }

            const { icon, typeText } = this.getObjectIconAndType(obj, index);

            // Проверяем, является ли объект плоскостью скетча
            const isSketchPlane = obj.userData.type === 'sketch_plane' ||
                                  obj.userData.type === 'work_plane';

            // Проверяем, есть ли на плоскости элементы скетча
            const hasSketchElements = isSketchPlane && this.checkPlaneForSketchElements(obj);

            // Создаем HTML для кнопок действий
            let actionsHTML = `
                <button class="scene-item-action" title="Скрыть/показать" data-action="toggle">
                    <i class="fas fa-eye${obj.visible ? '' : '-slash'}"></i>
                </button>
            `;

            // Добавляем кнопку редактирования скетча, если плоскость содержит элементы скетча
            if (hasSketchElements) {
                actionsHTML += `
                    <button class="scene-item-action" title="Редактировать скетч" data-action="edit-sketch">
                        <i class="fas fa-edit"></i>
                    </button>
                `;
            }

            actionsHTML += `
                <button class="scene-item-action" title="Удалить" data-action="delete">
                    <i class="fas fa-trash"></i>
                </button>
            `;

            div.innerHTML = `
                <i class="fas ${icon}"></i>
                <div class="scene-item-info">
                    <div class="scene-item-name">${obj.userData.name || typeText + ' ' + (index + 1)}</div>
                    <div class="scene-item-type">${typeText}</div>
                </div>
                <div class="scene-item-actions">
                    ${actionsHTML}
                </div>
            `;

            // Обработчик одинарного клика - выделение
//            div.addEventListener('click', (e) => {
//                if (!e.target.closest('.scene-item-action')) {
//                    this.editor.selectObject(obj);
//                }
//            });

            // Обработчик двойного клика - фокусировка камеры
            div.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (!e.target.closest('.scene-item-action')) {
                    // Выделяем объект при двойном клике
                    this.editor.selectObject(obj);

                    // Фокусируем камеру
                    this.focusCameraOnObject(obj);
                }
            });

            div.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
                e.stopPropagation();
                obj.visible = !obj.visible;
                const icon = e.target.closest('button').querySelector('i');
                icon.className = obj.visible ? 'fas fa-eye' : 'fas fa-eye-slash';
            });

            // Обработчик для кнопки редактирования скетча
            if (hasSketchElements) {
                div.querySelector('[data-action="edit-sketch"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Получаем инструмент скетча через toolManager
                    const sketchTool = this.editor.toolManager.getTool('sketch');
                    if (sketchTool) {
                        sketchTool.editExistingSketch(obj);
                    }
                });
            }

            div.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editor.deleteObject(obj);
            });

            container.appendChild(div);
        });
    }

    // Новый метод для фокусировки камеры на объекте
    focusCameraOnObject(object) {
        if (!object || !this.editor.camera) return;

        // Выделяем объект, если он не выделен
        if (!this.editor.selectedObjects.includes(object)) {
            this.editor.selectObject(object);
        }

        // Вычисляем bounding box объекта
        const boundingBox = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);

        // Если объект очень маленький (например, точка или линия), используем дефолтный размер
        const maxSize = Math.max(size.x, size.y, size.z);
        const targetDistance = maxSize > 0 ? maxSize * 2 : 100;

        // Вычисляем новую позицию камеры
        const direction = new THREE.Vector3();
        this.editor.camera.getWorldDirection(direction);

        // Сохраняем текущий взгляд камеры (направление)
        const cameraDirection = direction.clone();

        // Новая позиция камеры - от центра объекта отступим по направлению камеры
        const newPosition = new THREE.Vector3();
        newPosition.copy(center);

        // Отодвигаем камеру назад по направлению ее взгляда
        newPosition.add(cameraDirection.multiplyScalar(-targetDistance));

        // Создаем анимацию плавного перемещения камеры
        const animationDuration = 800; // мс
        const startPosition = this.editor.camera.position.clone();
        const startTarget = this.editor.controls.target.clone();

        const startTime = Date.now();

        const animateCamera = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);

            // Используем easeOutCubic для плавного замедления
            const easedProgress = 1 - Math.pow(1 - progress, 3);

            // Интерполируем позицию камеры
            this.editor.camera.position.lerpVectors(startPosition, newPosition, easedProgress);

            // Интерполируем цель камеры
            this.editor.controls.target.lerpVectors(startTarget, center, easedProgress);

            // Обновляем контролы
            this.editor.controls.update();

            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            } else {
                // После завершения анимации центрируем камеру точно на объекте
                this.editor.controls.target.copy(center);
                this.editor.controls.update();

                this.editor.showStatus(`Камера сфокусирована на объекте`, 'info');
            }
        };

        // Запускаем анимацию
        animateCamera();
    }

    highlightObject(object) {
        if (object.isGroup) {
            object.traverse((child) => {
                if (child.isMesh && child.material) {
                    this.highlightSingleObject(child);
                }
            });
        } else if (object.isMesh && object.material) {
            this.highlightSingleObject(object);
        }
    }

    highlightSingleObject(object) {
        if (!object.material || object.userData.isHighlighted) return;

        object.userData.originalMaterial = object.material;
        object.userData.isHighlighted = true;

        if (object.material.isMeshPhongMaterial || object.material.isMeshLambertMaterial) {
            const highlightMaterial = object.material.clone();
            highlightMaterial.emissive = new THREE.Color(0x444444);
            highlightMaterial.emissiveIntensity = 0.8;
            const originalColor = highlightMaterial.color.clone();
            const highlightedColor = originalColor.multiplyScalar(1.3);
            highlightMaterial.color.copy(highlightedColor);
            object.material = highlightMaterial;
            object.material.needsUpdate = true;
        }
        else if (object.material.isMeshBasicMaterial) {
            const highlightMaterial = object.material.clone();
            const originalColor = highlightMaterial.color.clone();
            const highlightedColor = originalColor.multiplyScalar(1.5);
            highlightMaterial.color.copy(highlightedColor);
            if (highlightMaterial.transparent) {
                highlightMaterial.opacity = Math.min(highlightMaterial.opacity * 1.5, 1.0);
            }
            object.material = highlightMaterial;
            object.material.needsUpdate = true;
        }
    }

    unhighlightObject(object) {
        if (object.isGroup) {
            object.traverse((child) => {
                if (child.isMesh && child.userData.isHighlighted) {
                    this.unhighlightSingleObject(child);
                }
            });
        } else if (object.isMesh && object.userData.isHighlighted) {
            this.unhighlightSingleObject(object);
        }
    }

    unhighlightSingleObject(object) {
        if (!object.userData.originalMaterial) return;
        object.material = object.userData.originalMaterial;
        object.material.needsUpdate = true;
        delete object.userData.originalMaterial;
        delete object.userData.isHighlighted;
    }

    findTopParent(object) {
        while (object.parent && object.parent !== this.editor.objectsGroup) {
            object = object.parent;
        }
        return object;
    }

    safeSetElementColor(element, colorHex) {
        if (!element || !element.material) return;

        try {
            const newMaterial = element.material.clone();
            newMaterial.color.setHex(colorHex);
            newMaterial.needsUpdate = true;

            if (!element.userData.originalMaterial) {
                element.userData.originalMaterial = element.material;
            }

            element.material = newMaterial;
        } catch (error) {
            console.warn('Error setting element color:', error);
        }
    }

    // Метод для получения всех скетч-элементов (включая вложенные)
    getAllSketchElements() {
        const elements = [];

        const collectElements = (object) => {
            if (object.userData && object.userData.type === 'sketch_element') {
                elements.push(object);
            }
            object.children.forEach(child => collectElements(child));
        };

        // Проверяем все плоскости скетча
        this.editor.sketchPlanes.forEach(plane => collectElements(plane));

        // Проверяем рабочие плоскости
        this.editor.workPlanes.forEach(plane => collectElements(plane));

        // Проверяем objectsGroup
        collectElements(this.editor.objectsGroup);

        return elements;
    }

    // Метод для получения замкнутых контуров
    getClosedSketchElements() {
        const allElements = this.getAllSketchElements();
        return allElements.filter(element => {
            if (!element.userData || !element.userData.type === 'sketch_element') {
                return false;
            }

            // Используем метод из extrudeManager
            return this.editor.extrudeManager.isSketchElementClosed(element);
        });
    }

    // Метод для подсветки всех элементов в группе
    highlightSketchElementsInGroup(group) {
        if (!group) return;

        group.traverse(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                this.safeSetElementColor(child, 0x2196F3);
            }
        });
    }

    isElementSelected(element) {
        return this.editor.selectedObjects.includes(element);
    }

    toggleElementSelection(element) {
        const index = this.editor.selectedObjects.indexOf(element);
        if (index > -1) {
            this.editor.selectedObjects.splice(index, 1);
            this.safeRestoreElementColor(element);
        } else {
            this.editor.selectedObjects.push(element);
            this.safeSetElementColor(element, 0xFFA500); // Оранжевый для множественного выделения
        }
    }

    safeRestoreElementColor(element) {
        if (!element || !element.userData) return;

        try {
            if (element.userData.originalMaterial) {
                element.material = element.userData.originalMaterial;
                delete element.userData.originalMaterial;
            } else if (element.userData.originalColor) {
                const newMaterial = element.material.clone();
                newMaterial.color.copy(element.userData.originalColor);
                newMaterial.needsUpdate = true;
                element.material = newMaterial;
            }
        } catch (error) {
            console.warn('Error restoring element color:', error);
        }
    }
}