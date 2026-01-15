class TransformToolBase extends Tool {
    constructor(name, icon, editor) {
        super(name, icon, editor);

        this.gizmoGroup = new THREE.Group();
        this.editor.scene.add(this.gizmoGroup);

        this.attachedObject = null;
        this.isDragging = false;
        this.currentAxis = null;
        this.startPosition = new THREE.Vector3();
        this.startRotation = new THREE.Quaternion();
        this.startScale = new THREE.Vector3();
        this.startMouse = new THREE.Vector2();

        this.axisColors = {
            x: 0xff4444,
            y: 0x44ff44,
            z: 0x4444ff
        };

        this.snapEnabled = true;
        this.moveSnapValue = 1.0;
        this.sizeSnapValue = 1.0;
        this.rotateSnapValue = 5;

        this.moveDelta = new THREE.Vector3();
        this.sizeDelta = new THREE.Vector3();

        this.propertiesElement = null;
        this.requiresSelection = true;

        this.lastMousePosition = new THREE.Vector2();
        this.tooltip = null;

        this.gizmoBaseSize = 20; // Базовый размер гизмо
        this.initGizmo();
    }

    initGizmo() {
        // Будет переопределено в дочерних классах
    }

    onActivate() {
        super.onActivate();

        // Создаем раздел свойств для этого инструмента
        this.createPropertiesSection();

        // Если есть выделенный объект, активируем gizmo
        if (this.editor.selectedObjects.length === 1) {
            this.attachToObject(this.editor.selectedObjects[0]);
        } else {
            this.editor.showStatus(`Выберите объект для ${this.name}`, 'info');
        }
    }

    onDeactivate() {
        super.onDeactivate();

        // Удаляем раздел свойств
        this.removePropertiesSection();

        // Удаляем tooltip
        this.removeTooltip();

        // Скрываем gizmo
        this.detach();
        this.gizmoGroup.visible = false;
    }

    createPropertiesSection() {
        const propertiesContent = document.getElementById('propertiesContent');
        if (!propertiesContent) return;

        console.log(`Создание раздела свойств для ${this.name}`);

        // Удаляем предыдущие свойства этого инструмента
        const oldSection = propertiesContent.querySelector(`.property-group[data-tool="${this.name}"]`);
        if (oldSection) {
            oldSection.remove();
        }

        // Создаем новый раздел
        this.propertiesElement = document.createElement('div');
        this.propertiesElement.className = 'property-group';
        this.propertiesElement.setAttribute('data-tool', this.name);
        this.propertiesElement.innerHTML = this.getPropertiesHTML();
        propertiesContent.appendChild(this.propertiesElement);

        // Добавляем обработчики событий
        this.bindPropertiesEvents();

        // Показываем только этот раздел, скрываем другие
       // this.showOnlyCurrentProperties();
    }

    removePropertiesSection() {
        if (this.propertiesElement && this.propertiesElement.parentNode) {
            this.propertiesElement.parentNode.removeChild(this.propertiesElement);
        }
        this.propertiesElement = null;
    }

    getPropertiesHTML() {
        // Будет переопределено в дочерних классах
        return '';
    }

    bindPropertiesEvents() {
        // Будет переопределено в дочерних классах
    }

//    showOnlyCurrentProperties() {
//        const propertiesContent = document.getElementById('propertiesContent');
//        if (!propertiesContent) return;
//
//        const allGroups = propertiesContent.querySelectorAll('.property-group');
//
//        allGroups.forEach(group => {
//            const toolName = group.getAttribute('data-tool');
//            if (toolName === this.name) {
//                group.style.display = 'block';
//            } else {
//                group.style.display = 'none';
//            }
//        });
//    }

    attachToObject(object) {
        if (!object || !this.canTransformObject(object)) return;

        this.attachedObject = object;
        this.updateGizmoPosition();
        this.gizmoGroup.visible = true;

        // Обновляем значения в полях свойств
        this.updatePropertiesValues();
    }

    detach() {
        this.attachedObject = null;
        this.gizmoGroup.visible = false;
    }

     updateGizmoPosition() {
        if (!this.attachedObject) return;

        // Получаем мировую позицию объекта
        const worldPos = new THREE.Vector3();
        this.attachedObject.getWorldPosition(worldPos);
        this.gizmoGroup.position.copy(worldPos);

        // Обновляем вращение gizmo в зависимости от системы координат
        if (this.useLocalCoordinates) {
            // Локальные координаты: совпадает с вращением объекта
            this.gizmoGroup.quaternion.copy(this.attachedObject.quaternion);
        } else {
            // Глобальные координаты: сбрасываем вращение
            this.gizmoGroup.quaternion.identity();
        }

        // Масштабируем gizmo в зависимости от размера объекта
        const box = new THREE.Box3().setFromObject(this.attachedObject);
        const size = new THREE.Vector3();
        box.getSize(size);

        const maxSize = Math.max(size.x, size.y, size.z);
        const gizmoSize = Math.max(10, maxSize * 1.5);

        this.gizmoGroup.scale.setScalar(gizmoSize / 15);
    }

    updatePropertiesValues() {
        if (!this.attachedObject) return;

        // Будет переопределено в дочерних классах
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        // Обновляем состояние snapEnabled по текущему Ctrl
        this.snapEnabled = !e.ctrlKey;

        this.editor.updateMousePosition(e);
        this.lastMousePosition.copy(this.editor.mouse);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Проверяем, кликнули ли на gizmo
        const gizmoMeshes = [];
        this.gizmoGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                gizmoMeshes.push(child);
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(gizmoMeshes, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            let axis = null;

            // Ищем ось в userData объекта или его родителей
            let current = object;
            while (current && !axis) {
                if (current.userData && current.userData.axis) {
                    axis = current.userData.axis;
                    break;
                }
                current = current.parent;
            }

            if (axis) {
                this.startDragging(axis, e);
                return true;
            }
        }

        // Если кликнули не на gizmo, пытаемся выбрать объект
        const sceneIntersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (sceneIntersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(sceneIntersects[0].object);

            if (this.canTransformObject(object)) {
                this.editor.selectSingleObject(object);
                this.attachToObject(object);
                return true;
            }
        }

        return false;
    }

    startDragging(axis, e) {
        this.currentAxis = axis;
        this.isDragging = true;
        this.startMouse.set(e.clientX, e.clientY);

        if (this.attachedObject) {
            this.startPosition.copy(this.attachedObject.position);
            this.startRotation.copy(this.attachedObject.quaternion);
            this.startScale.copy(this.attachedObject.scale);

            // Сохраняем начальное состояние для истории
            this.attachedObject.userData.transformStartState = {
                position: this.attachedObject.position.clone(),
                rotation: this.attachedObject.quaternion.clone(),
                scale: this.attachedObject.scale.clone()
            };
        }

        // Создаем tooltip
        this.createTooltip();
    }

    onMouseMove(e) {
        if (!this.isDragging || !this.attachedObject) return;

        // Обновляем состояние snapEnabled по текущему Ctrl
        this.snapEnabled = !e.ctrlKey;

        const deltaX = e.clientX - this.startMouse.x;
        const deltaY = e.clientY - this.startMouse.y;

        this.handleTransform(deltaX, deltaY);
        this.updateGizmoPosition();
        this.updatePropertiesValues();

        // Обновляем tooltip
        this.updateTooltip();
    }

    handleTransform(deltaX, deltaY) {
        // Будет переопределено в дочерних классах
    }

    onMouseUp(e) {
        if (this.isDragging && this.attachedObject) {
            this.saveToHistory();
        }

        this.isDragging = false;
        this.currentAxis = null;

        // Удаляем tooltip
        this.removeTooltip();
    }

    saveToHistory() {
        if (!this.attachedObject || !this.attachedObject.userData.transformStartState) return;

        const actionData = this.createHistoryAction();
        if (actionData) {
            this.editor.history.addAction(actionData);
        }

        delete this.attachedObject.userData.transformStartState;
    }
    createHistoryAction() {}

    getHistoryActionType() {
        return 'transform';
    }

    getCurrentState() {
        if (!this.attachedObject) return null;

        return {
            position: this.attachedObject.position.clone(),
            rotation: this.attachedObject.quaternion.clone(),
            scale: this.attachedObject.scale.clone()
        };
    }

    canTransformObject(object) {
        if (!object) return false;

//        // Нельзя трансформировать рабочие плоскости
//        if (object.userData.type === 'work_plane' ||
//            object.userData.type === 'sketch_plane' ||
//            object.userData.type === 'base_plane') {
//            return false;
//        }

        return true;
    }

    update() {
        if (this.attachedObject && this.gizmoGroup.visible) {
            this.updateGizmoPosition();
        }
    }

    // TOOLTIP методы
    createTooltip() {
        this.removeTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'transform-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            pointer-events: none;
            z-index: 10000;
            min-width: 180px;
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            display: flex;
            flex-direction: column;
            gap: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: opacity 0.2s;
        `;

        this.tooltip = tooltip;
        document.body.appendChild(tooltip);
    }

    updateTooltip() {
        if (!this.tooltip || !this.attachedObject) return;

        const position = this.getGizmoScreenPosition();
        if (!position) return;

        let html = this.getTooltipContent();
        if (!html) return;

        this.tooltip.innerHTML = html;
        this.tooltip.style.left = (position.x + 120) + 'px';
        this.tooltip.style.top = (position.y - this.tooltip.offsetHeight / 2) + 'px';
    }

    getGizmoScreenPosition() {
        if (!this.attachedObject) return null;

        const vector = new THREE.Vector3();
        this.attachedObject.getWorldPosition(vector);
        vector.project(this.editor.camera);

        const width = this.editor.renderer.domElement.clientWidth;
        const height = this.editor.renderer.domElement.clientHeight;

        return {
            x: (vector.x * 0.5 + 0.5) * width,
            y: (-vector.y * 0.5 + 0.5) * height
        };
    }

    getTooltipContent() {
        // Будет переопределено в дочерних классах
        return '';
    }

    removeTooltip() {
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }
        this.tooltip = null;
    }
}