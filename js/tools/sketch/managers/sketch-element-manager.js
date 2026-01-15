/**
 * Менеджер элементов скетча
 */
class SketchElementManager {
    constructor(sketchManager, snapHelper, contourManager ) {
        this.sketchManager = sketchManager;
        this.contourManager = contourManager;
        this.elements = [];
        this.selectedElements = [];
        this.snapHelper = snapHelper;
    }

    /**
     * Добавление элемента
     */
    addElement(element) {
        if (!element || !element.type) return;

        // Сохраняем состояние ДО добавления
        const previousSketchState = this.getCurrentSketchState();

        const isClosed = ['rectangle', 'circle', 'polygon', 'oval', 'stadium', 'arc'].includes(element.type);

        // Создаем геометрию элемента
        const geometry = this.createElementGeometry(element, isClosed);
        if (!geometry) return;

        // Создаем mesh
        const mesh = this.createElementMesh(element, geometry, isClosed);

        // Сохраняем данные элемента
        mesh.userData = this.createElementUserData(element, mesh, isClosed);

        // Добавляем на плоскость
        this.sketchManager.currentPlane.add(mesh);
        element.mesh = mesh;
        this.elements.push(element);

        // Добавляем в историю
        if (this.sketchManager.editor.history) {
            this.sketchManager.editor.history.addAction({
                type: 'sketch_add',
                sketchPlaneId: this.sketchManager.currentPlane.uuid,
                previousSketchState: previousSketchState,
                elements: [{
                    uuid: mesh.uuid,
                    data: this.serializeSketchElement(mesh)
                }]
            });
        }

        // Обновляем точки привязки
        if (this.snapHelper) {
            this.snapHelper.updateSnapPoints();
        }

        // Автоматическое определение контуров
        if (this.contourManager.autoDetectContours) {
            this.contourManager.detectContours();
        }

        this.showSuccessMessage(element.type);
    }

    /**
     * Создание геометрии элемента
     */
    createElementGeometry(element, isClosed) {
        const localPoints = element.points ? element.points.map(p =>
            this.sketchManager.currentPlane.worldToLocal(p.clone())
        ) : [];

        const vertices = [];
        localPoints.forEach(point => {
            vertices.push(point.x, point.y, 0.01);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        return geometry;
    }

    /**
     * Создание mesh элемента
     */
    createElementMesh(element, geometry, isClosed) {
        let mesh;

        if (element.type === 'dashed-line') {
            const material = new THREE.LineDashedMaterial({
                color: new THREE.Color(element.color || this.sketchManager.sketchColor),
                linewidth: 2,
                dashSize: element.dashSize || 2,
                gapSize: element.gapSize || 2,
                scale: 1
            });
            mesh = new THREE.Line(geometry, material);
            mesh.computeLineDistances();
        } else if (isClosed) {
            mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                color: new THREE.Color(element.color || this.sketchManager.sketchColor),
                linewidth: 2
            }));
        } else {
            mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({
                color: new THREE.Color(element.color || this.sketchManager.sketchColor),
                linewidth: 2
            }));
        }

        return mesh;
    }

    /**
     * Создание userData элемента
     */
    createElementUserData(element, mesh, isClosed) {
        const userData = {
            type: 'sketch_element',
            elementType: element.type,
            isClosed: isClosed,
            originalColor: new THREE.Color(element.color || this.sketchManager.sketchColor),
            sketchPlaneId: this.sketchManager.currentPlane.uuid,
            localPoints: element.points ? element.points.map(p =>
                this.sketchManager.currentPlane.worldToLocal(p.clone())
            ) : [],
            createdAt: new Date().toISOString()
        };

        // Сохраняем дополнительные параметры
        const extraFields = ['center', 'radius', 'diameter', 'width', 'height',
                           'radiusX', 'radiusY', 'sides', 'dashSize', 'gapSize',
                           'startAngle', 'endAngle', 'start', 'end', 'length'];

        extraFields.forEach(field => {
            if (element[field] !== undefined) {
                userData[field] = element[field];

                // Сохраняем локальные координаты
                if ((field === 'center' || field === 'start' || field === 'end') &&
                    element[field] && this.sketchManager.currentPlane) {
                    userData[`${field}Local`] = this.sketchManager.currentPlane.worldToLocal(element[field].clone());
                }
            }
        });

        return userData;
    }

    /**
     * Сообщение об успешном добавлении
     */
    showSuccessMessage(elementType) {
        const toolNames = {
            'line': 'Линия',
            'rectangle': 'Прямоугольник',
            'circle': 'Окружность',
            'polygon': 'Многоугольник',
            'polyline': 'Полилиния',
            'arc': 'Дуга',
            'oval': 'Овал',
            'stadium': 'Стадион',
            'mirror': 'Симметрия',
            'dashed-line': 'Пунктирная линия',
            'dimension': 'Размер'
        };

        this.sketchManager.editor.showStatus(
            `Добавлен элемент: ${toolNames[elementType] || elementType}`,
            'success'
        );
    }

    /**
     * Сериализация элемента скетча
     */
    serializeSketchElement(mesh) {
        if (!mesh) return null;

        if (this.sketchManager.editor.projectManager) {
            return this.sketchManager.editor.projectManager.serializeObject(mesh);
        }

        return {
            uuid: mesh.uuid,
            type: mesh.type,
            userData: { ...mesh.userData },
            geometry: mesh.geometry ? {
                type: mesh.geometry.type,
                parameters: mesh.geometry.parameters || {},
                attributes: mesh.geometry.attributes ? {
                    position: Array.from(mesh.geometry.attributes.position.array)
                } : {}
            } : null,
            material: mesh.material ? {
                type: mesh.material.type,
                color: mesh.material.color ? mesh.material.color.getHex() : 0x000000,
                linewidth: mesh.material.linewidth || 2
            } : null
        };
    }

    /**
     * Получение текущего состояния скетча
     */
    getCurrentSketchState() {
        if (!this.sketchManager.currentPlane) return null;

        const sketchState = {
            planeId: this.sketchManager.currentPlane.uuid,
            elements: []
        };

        this.sketchManager.currentPlane.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const elementData = this.serializeSketchElement(child);
                if (elementData) {
                    sketchState.elements.push({
                        uuid: child.uuid,
                        data: elementData
                    });
                }
            }
        });

        return sketchState;
    }

    /**
     * Обновление состояния элементов после undo/redo
     */
    updateElementsFromPlane() {
        if (!this.sketchManager.currentPlane) return;

        this.elements = [];
        this.selectedElements = [];

        this.sketchManager.currentPlane.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const element = {
                    type: child.userData.elementType,
                    mesh: child,
                    originalColor: child.userData.originalColor ||
                        new THREE.Color(this.sketchManager.sketchColor),
                    color: child.userData.originalColor || this.sketchManager.sketchColor,
                    localPoints: child.userData.localPoints,
                    localPosition: child.userData.localPosition,
                    isClosed: child.userData.isClosed,
                    sketchPlaneId: child.userData.sketchPlaneId,
                    userData: child.userData
                };

                this.elements.push(element);
            }
        });
    }

    /**
     * Удаление элемента из внутренних массивов
     */
    removeElementFromArrays(element) {
        const mesh = element.mesh || element;
        const elementIndex = this.elements.findIndex(el => el.mesh === mesh);
        if (elementIndex > -1) {
            this.elements.splice(elementIndex, 1);
        }

        const selectedIndex = this.selectedElements.findIndex(el => el.mesh === mesh);
        if (selectedIndex > -1) {
            this.selectedElements.splice(selectedIndex, 1);
        }
    }

    /**
     * Поиск элемента по точке
     */
    getElementAtPoint(point) {
        if (!this.sketchManager.currentPlane) return null;

        const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
        const threshold = 5;

        // Проверяем в обратном порядке (последние добавленные - сверху)
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const element = this.elements[i];
            if (!element.mesh) continue;

            const points = element.mesh.userData?.localPoints || [];

            // Проверяем каждую пару точек
            for (let j = 0; j < points.length - 1; j++) {
                const p1 = points[j];
                const p2 = points[j + 1];

                if (!p1 || !p2) continue;

                const distance = this.pointToLineDistance(localPoint, p1, p2);
                if (distance <= threshold) {
                    return element;
                }
            }

            // Проверяем замыкание контура
            if (points.length >= 3 && element.mesh.userData?.isClosed) {
                const p1 = points[points.length - 1];
                const p2 = points[0];

                if (p1 && p2) {
                    const distance = this.pointToLineDistance(localPoint, p1, p2);
                    if (distance <= threshold) {
                        return element;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Расстояние от точки до линии
     */
    pointToLineDistance(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Выделение элемента
     */
    selectElement(element) {
        this.clearSelection();
        this.selectedElements = [element];
        this.highlightElement(element);

        console.log('select sketch Element', this.selectedElements);

        this.sketchManager.editor.showStatus(
            `Выбран элемент: ${this.getToolName(element.type)}`,
            'info'
        );
    }

    /**
     * Переключение выделения элемента
     */
    toggleElementSelection(element) {
        const index = this.selectedElements.indexOf(element);
        if (index > -1) {
            this.unhighlightElement(element);
            this.selectedElements.splice(index, 1);
        } else {
            this.selectedElements.push(element);
            this.highlightElement(element);
        }

        this.sketchManager.editor.showStatus(
            `Выбрано элементов: ${this.selectedElements.length}`,
            'info'
        );
    }

    /**
     * Выделение всех элементов
     */
    selectAllElements() {
        this.clearSelection();
        this.selectedElements = [...this.elements];
        this.selectedElements.forEach(element => this.highlightElement(element));

        this.sketchManager.editor.showStatus(
            `Выбрано всех элементов: ${this.selectedElements.length}`,
            'info'
        );
    }

    /**
     * Очистка выделения
     */
    clearSelection() {
        this.selectedElements.forEach(element => this.unhighlightElement(element));
        this.selectedElements = [];
    }

    /**
     * Подсветка элемента
     */
    highlightElement(element) {
        if (!element.mesh || !element.mesh.material) return;

        if (!element.originalColor) {
            element.originalColor = element.mesh.material.color
                ? element.mesh.material.color.clone()
                : new THREE.Color(this.sketchManager.sketchColor);

            if (element.mesh.material.linewidth !== undefined) {
                element.originalLinewidth = element.mesh.material.linewidth;
            }
        }

        if (element.mesh.material.color) {
            element.mesh.material.color.set(this.sketchManager.highlightColor);
            element.mesh.material.needsUpdate = true;
        }

        if (element.mesh.material.linewidth !== undefined) {
            element.mesh.material.linewidth = 4;
            element.mesh.material.needsUpdate = true;
        }
    }

    /**
     * Снятие подсветки элемента
     */
    unhighlightElement(element) {
        if (!element.mesh || !element.mesh.material || !element.originalColor) return;

        element.mesh.material.color.copy(element.originalColor);
        element.mesh.material.needsUpdate = true;

        if (element.mesh.material.linewidth !== undefined && element.originalLinewidth !== undefined) {
            element.mesh.material.linewidth = element.originalLinewidth;
            element.mesh.material.needsUpdate = true;
            delete element.originalLinewidth;
        }

        delete element.originalColor;
    }

    /**
     * Удаление выделенных элементов
     */
    deleteSelectedElements() {
        if (this.selectedElements.length === 0) {
            this.sketchManager.editor.showStatus('Нет выделенных элементов для удаления', 'warning');
            return;
        }

        if (!confirm(`Удалить ${this.selectedElements.length} элементов?`)) {
            return;
        }

        // Сохраняем состояние ДО удаления
        const previousSketchState = this.getCurrentSketchState();
        const deletedElements = [...this.selectedElements];

        // Добавляем в историю
        if (this.sketchManager.editor.history) {
            this.sketchManager.editor.history.addAction({
                type: 'sketch_delete',
                sketchPlaneId: this.sketchManager.currentPlane.uuid,
                previousSketchState: previousSketchState,
                elements: deletedElements.map(element => ({
                    uuid: element.mesh.uuid,
                    data: this.serializeSketchElement(element.mesh)
                }))
            });
        }

        // Удаляем элементы
        deletedElements.forEach(element => {
            if (element.mesh && element.mesh.parent) {
                element.mesh.parent.remove(element.mesh);

                if (element.mesh.geometry) element.mesh.geometry.dispose();
                if (element.mesh.material) element.mesh.material.dispose();
            }

            // Удаляем из массива
            const index = this.elements.indexOf(element);
            if (index > -1) {
                this.elements.splice(index, 1);
            }
        });

        this.selectedElements = [];

        // Обновляем точки привязки
        if (this.snapHelper) {
            this.snapHelper.updateSnapPoints();
        }

        // Обновляем контуры
        if (this.contourManager.autoDetectContours) {
            this.contourManager.detectContours();
        }

        this.sketchManager.editor.showStatus(
            `Удалено элементов: ${deletedElements.length}`,
            'success'
        );
    }

    /**
     * Удаление всех элементов
     */
    deleteAllElements() {
        if (this.elements.length === 0) return;

        if (!confirm('Очистить весь чертеж?')) return;

        // Сохраняем состояние ДО очистки
        const previousSketchState = this.getCurrentSketchState();

        // Добавляем в историю
        if (this.sketchManager.editor.history) {
            this.sketchManager.editor.history.addAction({
                type: 'sketch_delete',
                sketchPlaneId: this.sketchManager.currentPlane.uuid,
                previousSketchState: previousSketchState,
                elements: this.elements.map(element => ({
                    uuid: element.mesh.uuid,
                    data: this.serializeSketchElement(element.mesh)
                }))
            });
        }

        // Удаляем все элементы
        this.elements.forEach(element => {
            if (element.mesh && element.mesh.parent) {
                element.mesh.parent.remove(element.mesh);

                if (element.mesh.geometry) element.mesh.geometry.dispose();
                if (element.mesh.material) element.mesh.material.dispose();
            }
        });

        this.elements = [];
        this.selectedElements = [];

        this.sketchManager.editor.showStatus('Чертеж очищен', 'success');
    }

    /**
     * Получение названия инструмента
     */
    getToolName(tool) {
        const names = {
            'line': 'Линия',
            'rectangle': 'Прямоугольник',
            'circle': 'Окружность',
            'polygon': 'Многоугольник',
            'polyline': 'Полилиния',
            'arc': 'Дуга',
            'oval': 'Овал',
            'stadium': 'Стадион',
            'mirror': 'Симметрия',
            'dashed-line': 'Пунктирная линия',
            'dimension': 'Размер'
        };
        return names[tool] || tool;
    }

    /**
     * Сбор элементов скетча с плоскости
     */
    collectSketchElements(planeObject) {
        this.elements = [];
        this.selectedElements = [];

        planeObject.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const element = {
                    type: child.userData.elementType,
                    mesh: child,
                    originalColor: child.userData.originalColor || new THREE.Color(this.sketchManager.sketchColor),
                    color: child.userData.originalColor || this.sketchManager.sketchColor,
                    localPoints: child.userData.localPoints,
                    localPosition: child.userData.localPosition,
                    isClosed: child.userData.isClosed,
                    sketchPlaneId: child.userData.sketchPlaneId,
                    userData: child.userData
                };

                this.elements.push(element);
            }
        });

        return this.elements.length;
    }

    /**
     * Очистка ресурсов
     */
    clear() {
        this.elements.forEach(element => this.unhighlightElement(element));
        this.elements = [];
        this.selectedElements = [];
    }
}