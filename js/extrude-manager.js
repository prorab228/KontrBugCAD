// ExtrudeManager.js - полностью исправленная версия
class ExtrudeManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.extrudePreview = null;
        this.extrudePreviewGroup = null;
        this.dragging = false;
        this.startHeight = 0;
        this.startMouseY = 0;
        this.currentOperation = 'new'; // 'new', 'cut', 'join'
        this.currentDirection = 'positive'; // 'positive', 'negative', 'both'
        this.selectedContours = [];
        this.previewMaterial = null;
        this.arrowHandle = null;
        this.lastIntersectPoint = null;
    }

    // Основные методы
    isSketchElementClosed(element) {
        if (!element || !element.userData) return false;

        if (element.userData.isClosed !== undefined) {
            return element.userData.isClosed === true;
        }

        const type = element.userData.elementType;
        if (type === 'rectangle' || type === 'circle') {
            return true;
        }

        if (type === 'line') {
            return false;
        }

        if (type === 'polyline') {
            if (!element.geometry || !element.geometry.attributes.position) {
                return false;
            }

            const positions = element.geometry.attributes.position.array;
            if (positions.length < 6) return false;

            const count = positions.length / 3;
            if (count < 3) return false;

            const x1 = positions[0], y1 = positions[1];
            const lastIndex = positions.length - 3;
            const x2 = positions[lastIndex], y2 = positions[lastIndex + 1];

            const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            return distance < 0.5;
        }

        return false;
    }

    findSketchPlaneForElement(element) {
        if (!element) return null;

        let parent = element.parent;
        while (parent) {
            if (parent.userData &&
                (parent.userData.type === 'sketch_plane' ||
                 parent.userData.type === 'work_plane')) {
                return parent;
            }
            parent = parent.parent;
        }

        return this.editor.sketchPlanes.length > 0 ?
               this.editor.sketchPlanes[0] :
               this.editor.workPlanes.length > 0 ?
               this.editor.workPlanes[0] : null;
    }



    // Подсветка доступных контуров
    highlightExtrudableContours() {
        const allElements = this.editor.objectsManager.getAllSketchElements();

        // Сначала обнуляем подсветку
        allElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        // Получаем замкнутые контуры
        const closedContours = this.getClosedContoursFromElements();

        // Подсвечиваем элементы, входящие в замкнутые контуры
        closedContours.forEach(contour => {
            if (contour.element) {
                this.editor.objectsManager.safeSetElementColor(contour.element, 0x2196F3);
            }
        });

        if (closedContours.length === 0) {
            this.editor.showStatus('Нет замкнутых контуров для вытягивания', 'warning');
        }
    }

    // Выбор контуров
    selectContourForExtrude(event) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        this.editor.raycaster.params.Line = { threshold: 5 };

        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        const closedElements = allSketchElements.filter(element =>
            this.isSketchElementClosed(element)
        );

        const intersects = this.editor.raycaster.intersectObjects(closedElements, false);

        if (intersects.length > 0) {
            const element = intersects[0].object;

            // Проверяем, является ли элемент вложенным
            const isNested = this.isContourNested(element, closedElements);

            if (event.ctrlKey || event.metaKey) {
                // Ctrl+клик - множественный выбор (включая вложенные)
                this.toggleContourSelection(element);
            } else {
                // Обычный клик
                this.clearContourSelection();

                // Если это вложенный контур, предлагаем выбрать все вложенные контуры в этой группе
                if (isNested) {
                    this.selectContourGroup(element, closedElements);
                } else {
                    this.selectSingleContour(element);
                }
            }

            const selectedContours = this.getSelectedContours();
            if (selectedContours.length > 0) {
                this.createExtrudeDirectionIndicator(selectedContours);
                this.updateExtrudePreview();
            }

            this.updateExtrudeUI();
            return true;
        }

        return false;
    }

    // 9. Метод для выбора группы контуров (внешний + все вложенные)
    selectContourGroup(mainContour, allContours) {
        if (!mainContour || !allContours) return;

        // Очищаем текущее выделение
        this.clearContourSelection();

        // Добавляем основной контур
        this.selectContour(mainContour);

        // Находим все вложенные контуры внутри этого
        for (let contour of allContours) {
            if (contour === mainContour) continue;

            const contourCenter = this.getContourCenter(contour);
            if (this.isPointInsideContour(contourCenter, mainContour)) {
                // Этот контур находится внутри основного
                this.selectContour(contour);
            }
        }

        this.editor.showStatus(`Выбрано ${this.getSelectedContours().length} контуров (включая вложенные)`, 'info');
    }


    // Управление выделением контуров
    toggleContourSelection(element) {
        if (!element.userData.isSelected) {
            this.selectContour(element);
        } else {
            this.deselectContour(element);
        }
    }

    getClosedContoursFromElements() {
        const contours = [];

        // Используем детектор контуров из SketchTools
        if (this.editor.sketchTools && this.editor.sketchTools.closedContours) {
            return this.editor.sketchTools.closedContours;
        }

        // Альтернативный метод: собираем все линии и проверяем
        const allElements = this.editor.objectsManager.getAllSketchElements();
        const lines = allElements.filter(el => el.userData.elementType === 'line');

        // Простой алгоритм поиска замкнутых контуров
        // (Здесь нужен более сложный алгоритм для реального использования)

        return contours;
    }


    // 1. Метод для вычисления центра фигуры (контура)
    getContourCenter(contour) {
        if (!contour || !contour.userData || !contour.userData.localPoints) {
            return new THREE.Vector3();
        }

        const localPoints = contour.userData.localPoints;
        const center = new THREE.Vector3();

        // Суммируем все точки
        localPoints.forEach(point => {
            center.add(point);
        });

        // Делим на количество точек
        if (localPoints.length > 0) {
            center.divideScalar(localPoints.length);
        }

        return center;
    }

    // 2. Метод для вычисления центра нескольких контуров
    getContoursCenter(contours) {
        if (!contours || contours.length === 0) {
            return new THREE.Vector3();
        }

        const totalCenter = new THREE.Vector3();
        let totalPoints = 0;

        contours.forEach(contour => {
            const contourCenter = this.getContourCenter(contour);
            if (contourCenter.length() > 0) {
                totalCenter.add(contourCenter);
                totalPoints++;
            }
        });

        if (totalPoints > 0) {
            totalCenter.divideScalar(totalPoints);
        }

        return totalCenter;
    }

    // 5. Метод для проверки, является ли контур вложенным
    isContourNested(contour, allContours) {
        if (!contour || !allContours || allContours.length < 2) return false;

        const contourCenter = this.getContourCenter(contour);
        if (contourCenter.length() === 0) return false;

        // Проверяем, находится ли центр этого контура внутри другого контура
        for (let otherContour of allContours) {
            if (otherContour === contour) continue;

            if (this.isPointInsideContour(contourCenter, otherContour)) {
                return true; // Этот контур вложен в другой
            }
        }

        return false;
    }

    // 6. Метод для проверки, находится ли точка внутри контура
    isPointInsideContour(point, contour) {
        if (!contour || !contour.userData || !contour.userData.localPoints) return false;

        const localPoints = contour.userData.localPoints;
        if (localPoints.length < 3) return false;

        // Используем алгоритм "луч"
        let inside = false;

        for (let i = 0, j = localPoints.length - 1; i < localPoints.length; j = i++) {
            const xi = localPoints[i].x, yi = localPoints[i].y;
            const xj = localPoints[j].x, yj = localPoints[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    }


    selectContour(element) {
        element.userData.isSelected = true;
        this.editor.objectsManager.safeSetElementColor(element, 0x0066FF);

        if (!this.selectedContours.includes(element)) {
            this.selectedContours.push(element);
        }
    }

    deselectContour(element) {
        element.userData.isSelected = false;
        this.editor.objectsManager.safeRestoreElementColor(element);

        const index = this.selectedContours.indexOf(element);
        if (index > -1) {
            this.selectedContours.splice(index, 1);
        }
    }

    selectSingleContour(element) {
        this.clearContourSelection();
        this.selectContour(element);
    }

    clearContourSelection() {
        this.selectedContours.forEach(contour => {
            this.deselectContour(contour);
        });
        this.selectedContours = [];
    }

    getSelectedContours() {
        return this.selectedContours;
    }

    // Создание стрелки направления
    createExtrudeDirectionIndicator(contours) {
        // Удаляем старую стрелку
        if (this.editor.extrudeArrow) {
            if (this.editor.extrudeArrow.parent) {
                this.editor.extrudeArrow.parent.remove(this.editor.extrudeArrow);
            }
            this.editor.extrudeArrow = null;
        }

        if (!contours || contours.length === 0) return;

        const contour = contours[0];
        const sketchPlane = this.findSketchPlaneForElement(contour);
        if (!sketchPlane) return;

        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(sketchPlane.quaternion);
        planeNormal.normalize();

        // Создаем группу для стрелки
        this.editor.extrudeArrow = new THREE.Group();
        this.editor.extrudeArrow.userData.isExtrudeArrow = true;
        this.editor.extrudeArrow.userData.isDraggable = true;

        // Отключаем raycast для всей группы стрелки
        this.editor.extrudeArrow.raycast = () => {};

        // Параметры стрелки
        const arrowLength = 25;
        const arrowHeadLength = 8;
        const arrowHeadWidth = 4;

        // Линия стрелки
        const lineGeometry = new THREE.CylinderGeometry(0.8, 0.8, arrowLength, 8);
        const lineMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.position.y = arrowLength / 2;
        line.userData.isArrowPart = true;
        line.userData.isDraggable = false; // Линия не перетаскиваемая
        line.raycast = () => {}; // Отключаем raycast для линии
        this.editor.extrudeArrow.add(line);

        // Наконечник стрелки - делаем его перетаскиваемым
        const coneGeometry = new THREE.ConeGeometry(arrowHeadWidth, arrowHeadLength, 8);
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.y = arrowLength + arrowHeadLength / 2;
        cone.userData.isArrowPart = true;
        cone.userData.isArrowHandle = true; // Кончик стрелки - это ручка
        cone.userData.isDraggable = true;

        // Добавляем на кончик большую невидимую сферу для лучшего захвата
        const handleGeometry = new THREE.SphereGeometry(arrowHeadWidth * 1.5, 8, 8);
        const handleMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF0000,
            transparent: true,
            opacity: 0.2,
            visible: true,
            depthTest: true,
            depthWrite: false
        });

        this.arrowHandle = new THREE.Mesh(handleGeometry, handleMaterial);
        this.arrowHandle.position.y = arrowLength + arrowHeadLength;
        this.arrowHandle.userData.isArrowHandle = true;
        this.arrowHandle.userData.isDraggable = true;

        // Добавляем конус и ручку в группу стрелки
        this.editor.extrudeArrow.add(cone);
        this.editor.extrudeArrow.add(this.arrowHandle);

        // Ориентируем стрелку по нормали плоскости
        const up = new THREE.Vector3(0, 1, 0);
        const rotationQuaternion = new THREE.Quaternion().setFromUnitVectors(
            up,
            planeNormal.clone().normalize()
        );
        this.editor.extrudeArrow.quaternion.copy(rotationQuaternion);

        // Добавляем стрелку в сцену
        this.editor.scene.add(this.editor.extrudeArrow);

        console.log('Стрелка создана с перетаскиванием за кончик:', {
            cone: cone,
            arrowHandle: this.arrowHandle,
            coneWorldPos: cone.getWorldPosition(new THREE.Vector3()),
            handleWorldPos: this.arrowHandle.getWorldPosition(new THREE.Vector3())
        });
    }


    updateArrowPosition() {
        if (!this.editor.extrudeArrow) return;

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';

        const selectedContours = this.getSelectedContours();
        if (selectedContours.length === 0) return;

        const sketchPlane = this.findSketchPlaneForElement(selectedContours[0]);
        if (!sketchPlane) return;

        // Получаем нормаль плоскости
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(sketchPlane.quaternion);
        planeNormal.normalize();

        // Получаем СРЕДНЮЮ ТОЧКУ ВСЕХ ВЫБРАННЫХ КОНТУРОВ
        const contoursCenter = this.getContoursCenter(selectedContours);

        // Преобразуем локальный центр в мировые координаты
        const worldCenter = sketchPlane.localToWorld(contoursCenter.clone());

        // Получаем позицию плоскости в мировых координатах
        const planePos = new THREE.Vector3();
        sketchPlane.getWorldPosition(planePos);

        // Вектор от плоскости до центра контуров
        const offsetVector = new THREE.Vector3().subVectors(worldCenter, planePos);

        // Базовое положение стрелки (на плоскости в центре контуров)
        const basePos = planePos.clone().add(offsetVector);

        // Рассчитываем смещение стрелки в зависимости от направления
        let previewCenterOffset = 0;

        if (direction === 'positive') {
            previewCenterOffset = height / 2;
        } else if (direction === 'negative') {
            previewCenterOffset = -height / 2;
        } else if (direction === 'both') {
            previewCenterOffset = 0;
        }

        // Позиция стрелки = базовое положение + смещение по нормали
        const arrowPos = basePos.clone().add(
            planeNormal.clone().multiplyScalar(previewCenterOffset + 2) // +2 для видимости
        );

        // Обновляем позицию стрелки
        this.editor.extrudeArrow.position.copy(arrowPos);

        // Обновляем мировую матрицу
        this.editor.extrudeArrow.updateMatrixWorld(true);

        console.log('Позиция стрелки обновлена:', {
            direction: direction,
            height: height,
            basePos: basePos.toArray().map(v => v.toFixed(2)),
            arrowPos: arrowPos.toArray().map(v => v.toFixed(2)),
            contoursCenter: contoursCenter.toArray().map(v => v.toFixed(2))
        });
    }

    handleArrowDragStart(event) {
        console.log('Попытка начать перетаскивание стрелки');

        if (!this.editor.extrudeArrow) {
            console.log('Нет стрелки');
            return false;
        }

        // Обновляем позицию мыши
        this.editor.updateMousePosition(event);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Собираем все перетаскиваемые части стрелки
        const draggableParts = [];

        if (this.editor.extrudeArrow) {
            this.editor.extrudeArrow.traverse((child) => {
                if (child.userData && child.userData.isDraggable) {
                    draggableParts.push(child);
                }
            });
        }

        if (draggableParts.length === 0) {
            console.log('Нет перетаскиваемых частей стрелки');
            return false;
        }

        // Обновляем мировые матрицы
        draggableParts.forEach(part => part.updateMatrixWorld(true));

        // Проверяем пересечение с перетаскиваемыми частями
        const intersects = this.editor.raycaster.intersectObjects(draggableParts, true);

        if (intersects.length > 0) {
            console.log('Пересечение с кончиком стрелки обнаружено, начинаем перетаскивание');
            this.dragging = true;
            this.startMouseY = event.clientY;
            this.startHeight = parseFloat(document.getElementById('extrudeHeight').value) || 10;
            document.body.style.cursor = 'grabbing';

            // Привязываем глобальные обработчики
            this.bindGlobalDragHandlers();

            event.stopPropagation();
            event.preventDefault();
            return true;
        }

        console.log('Пересечение с кончиком стрелки не обнаружено');
        return false;
    }


    handleArrowDrag(event) {
        if (!this.dragging) return;

        const selectedContours = this.getSelectedContours();
        if (selectedContours.length === 0) return;

        const sketchPlane = this.findSketchPlaneForElement(selectedContours[0]);
        if (!sketchPlane) return;

        // Получаем нормаль плоскости
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(sketchPlane.quaternion);
        planeNormal.normalize();

        // Получаем вектор от камеры к стрелке
        const arrowPos = this.editor.extrudeArrow.position;
        const cameraToArrow = new THREE.Vector3().subVectors(arrowPos, this.editor.camera.position).normalize();

        // Определяем, смотрит ли камера на стрелку с той же стороны, что и нормаль плоскости
        const dotProduct = planeNormal.dot(cameraToArrow);

        // Если скалярное произведение положительное, камера смотрит в направлении нормали
        // Если отрицательное - камера с обратной стороны
        const isCameraFacingNormal = dotProduct > 0;

        // Рассчитываем изменение высоты
        const deltaY = event.clientY - this.startMouseY;
        const sensitivity = 0.5;
        let heightChange = deltaY * sensitivity;

        // ИНВЕРТИРУЕМ в зависимости от положения камеры
        if (isCameraFacingNormal) {
            // Камера смотрит в направлении нормали
            // Движение мыши ВВЕРХ (от плоскости) должно УВЕЛИЧИВАТЬ высоту
            // Движение мыши ВНИЗ (к плоскости) должно УМЕНЬШАТЬ высоту
            heightChange = -heightChange;
        }
        // Если камера с обратной стороны, оставляем как есть

        let newHeight = this.startHeight + heightChange;
        newHeight = Math.max(0.1, newHeight);
        newHeight = Math.round(newHeight * 10) / 10;

        console.log('Изменение высоты:', {
            deltaY: deltaY,
            heightChange: heightChange,
            oldHeight: this.startHeight,
            newHeight: newHeight,
            isCameraFacingNormal: isCameraFacingNormal,
            dotProduct: dotProduct.toFixed(3)
        });

        const heightInput = document.getElementById('extrudeHeight');
        if (heightInput) {
            heightInput.value = newHeight;

            const inputEvent = new Event('input', { bubbles: true });
            heightInput.dispatchEvent(inputEvent);

            const btn = document.getElementById('performExtrude');
            if (btn) {
                btn.innerHTML = `<i class="fas fa-check"></i> Выполнить (${newHeight.toFixed(1)} мм)`;
            }
        }

        event.preventDefault();
        return false;
    }


    // Добавьте этот новый метод для визуализации позиции стрелки (для отладки):
    debugArrowPosition() {
        if (!this.editor.extrudeArrow) return;

        const worldPos = new THREE.Vector3();
        this.arrowHandle.getWorldPosition(worldPos);

        console.log('Позиция стрелки в мире:', {
            x: worldPos.x.toFixed(2),
            y: worldPos.y.toFixed(2),
            z: worldPos.z.toFixed(2)
        });

        // Создаем временную точку для визуализации
        const sphereGeometry = new THREE.SphereGeometry(2, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        debugSphere.position.copy(worldPos);
        this.editor.scene.add(debugSphere);

        // Удаляем через 5 секунд
        setTimeout(() => {
            this.editor.scene.remove(debugSphere);
            sphereGeometry.dispose();
            sphereMaterial.dispose();
        }, 5000);
    }


    // Новый метод для привязки глобальных обработчиков:
    bindGlobalDragHandlers() {
        // Сохраняем ссылки на обработчики для последующего удаления
        this.globalMouseMoveHandler = (e) => this.handleArrowDrag(e);
        this.globalMouseUpHandler = (e) => {
            this.handleArrowDragEnd(e);
            this.unbindGlobalDragHandlers();
        };

        // Добавляем обработчики на весь документ
        document.addEventListener('mousemove', this.globalMouseMoveHandler);
        document.addEventListener('mouseup', this.globalMouseUpHandler);
    }

    // Новый метод для удаления глобальных обработчиков:
    unbindGlobalDragHandlers() {
        if (this.globalMouseMoveHandler) {
            document.removeEventListener('mousemove', this.globalMouseMoveHandler);
            this.globalMouseMoveHandler = null;
        }

        if (this.globalMouseUpHandler) {
            document.removeEventListener('mouseup', this.globalMouseUpHandler);
            this.globalMouseUpHandler = null;
        }
    }


    handleArrowDrag(event) {
        if (!this.dragging) return;

        // ИСПРАВЛЕНО: инвертируем направление
        // При движении мыши ВВЕРХ (меньший clientY) - увеличиваем высоту
        // При движении мыши ВНИЗ (больший clientY) - уменьшаем высоту
        const deltaY = event.clientY - this.startMouseY; // Было: this.startMouseY - event.clientY
        const sensitivity = 0.5;
        let heightChange = deltaY * sensitivity;

        // Инвертируем изменение высоты
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';
        if (direction === 'negative') heightChange = -heightChange;
        let newHeight = this.startHeight + heightChange; // Было: this.startHeight + heightChange

        // Ограничиваем минимальную высоту
        newHeight = Math.max(0.1, newHeight);

        // Округляем до одного десятичного знака
        newHeight = Math.round(newHeight * 10) / 10;

        console.log('Изменение высоты:', {
            startMouseY: this.startMouseY,
            currentMouseY: event.clientY,
            deltaY: deltaY,
            heightChange: heightChange,
            oldHeight: this.startHeight,
            newHeight: newHeight
        });

        // Обновляем поле ввода высоты
        const heightInput = document.getElementById('extrudeHeight');
        if (heightInput) {
            heightInput.value = newHeight;

            // Генерируем событие input для обновления предпросмотра
            const inputEvent = new Event('input', { bubbles: true });
            heightInput.dispatchEvent(inputEvent);

            // Обновляем текст кнопки
            const btn = document.getElementById('performExtrude');
            if (btn) {
                btn.innerHTML = `<i class="fas fa-check"></i> Выполнить (${newHeight.toFixed(1)} мм)`;
            }
        }

        // Предотвращаем стандартное поведение
        event.preventDefault();
        return false;
    }



    handleArrowDragEnd(event) {
        if (!this.dragging) return;

        console.log('Завершено перетаскивание стрелки');
        this.dragging = false;
        document.body.style.cursor = 'default';

        // Удаляем глобальные обработчики
        this.unbindGlobalDragHandlers();
    }


    createExtrusionGeometry(contours, height, direction) {
        if (contours.length === 0) return null;

        const shapes = [];

        contours.forEach(element => {
            if (!element.userData || !element.userData.localPoints) return;

            const localPoints = element.userData.localPoints;
            const shapePoints = [];

            for (let i = 0; i < localPoints.length; i++) {
                shapePoints.push(new THREE.Vector2(localPoints[i].x, localPoints[i].y));
            }

            if (shapePoints.length > 0) {
                const shape = new THREE.Shape(shapePoints);
                shapes.push(shape);
            }
        });

        if (shapes.length === 0) return null;

        let extrudeDepth = height;
        const extrudeSettings = {
            depth: extrudeDepth,
            bevelEnabled: false,
            steps: 1
        };

        try {
            const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);

            // Применяем трансформации для направления вытягивания
            if (direction === 'negative') {
                // Для отрицательного направления вращаем геометрию на 180 градусов
                geometry.translate(0, 0, -height);
            } else if (direction === 'both') {
                // Для обоих направлений сдвигаем геометрию на половину высоты вниз
                geometry.translate(0, 0, -height / 2);
            }

            if (contours.length > 0) {
                const firstContour = contours[0];
                const sketchPlane = this.findSketchPlaneForElement(firstContour);

                if (sketchPlane) {
                    // Получаем позицию контура в локальных координатах плоскости
                    const contourPos = new THREE.Vector3();
                    firstContour.getWorldPosition(contourPos);

                    const localPos = sketchPlane.worldToLocal(contourPos.clone());

                    // Смещаем геометрию в позицию контура
                    geometry.translate(localPos.x, localPos.y, 0);

                    // Также обновляем bounding box
                    geometry.computeBoundingBox();
                }
            }

            return geometry;
        } catch (error) {
            console.error('Ошибка создания геометрии выдавливания:', error);
            return null;
        }
    }

    updateExtrudePreview() {
        const selectedContours = this.getSelectedContours();
        if (selectedContours.length === 0) return;

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';

        // Удаляем старый предпросмотр
        if (this.extrudePreviewGroup) {
            this.editor.objectsGroup.remove(this.extrudePreviewGroup);
            this.extrudePreviewGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.extrudePreviewGroup = null;
        }

        // Создаем новый предпросмотр
        const geometry = this.createExtrusionGeometry(selectedContours, height, direction);
        if (!geometry) return;

        if (!this.previewMaterial) {
            this.previewMaterial = new THREE.MeshPhongMaterial({
                color: 0x4CAF50,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
        }

        const previewMesh = new THREE.Mesh(geometry, this.previewMaterial);

        const firstContour = selectedContours[0];
        const sketchPlane = this.findSketchPlaneForElement(firstContour);

        if (sketchPlane) {
            const planeWorldPos = new THREE.Vector3();
            sketchPlane.getWorldPosition(planeWorldPos);

            previewMesh.position.copy(planeWorldPos);
            previewMesh.quaternion.copy(sketchPlane.quaternion);

            // Применяем небольшое смещение для видимости
            const planeNormal = new THREE.Vector3(0, 0, 1);
            planeNormal.applyQuaternion(sketchPlane.quaternion);
            planeNormal.normalize();

            if (direction === 'negative') {
                previewMesh.position.add(planeNormal.clone().multiplyScalar(0.1));
            } else if (direction === 'both') {
                // Ничего не делаем
            } else {
                previewMesh.position.add(planeNormal.clone().multiplyScalar(0.1));
            }
        }

        this.extrudePreviewGroup = new THREE.Group();
        this.extrudePreviewGroup.add(previewMesh);
        this.editor.objectsGroup.add(this.extrudePreviewGroup);

        this.updateArrowPosition();
    }



    performExtrude() {
        const selectedContours = this.getSelectedContours();
        if (selectedContours.length === 0) {
            this.editor.showStatus('Выберите контур(ы) для вытягивания', 'error');
            return;
        }

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';
        const operation = document.getElementById('extrudeOperation')?.value || 'new';

        if (isNaN(height) /*|| height <= 0*/) {
            this.editor.showStatus('Введите корректную высоту (больше 0)', 'error');
            return;
        }

        const geometry = this.createExtrusionGeometry(selectedContours, height, direction);
        if (!geometry) {
            this.editor.showStatus('Не удалось создать геометрию выдавливания', 'error');
            return;
        }

        const mesh = this.createExtrusionMesh(geometry, height, direction, selectedContours);
        if (!mesh) {
            this.editor.showStatus('Не удалось создать объект выдавливания', 'error');
            return;
        }

        switch (operation) {
            case 'new':
                this.handleNewOperation(mesh);
                break;
            case 'cut':
                this.handleCutOperation(mesh);
                break;
            case 'join':
                this.handleJoinOperation(mesh);
                break;
        }

        this.cancelExtrudeMode();
        this.editor.showStatus(`Выполнено выдавливание (${height} мм)`, 'success');
    }

    handleNewOperation(mesh) {
        this.editor.objectsGroup.add(mesh);
        this.editor.objects.push(mesh);

        mesh.scale.set(0.1, 0.1, 0.1);
        new TWEEN.Tween(mesh.scale)
            .to({ x: 1, y: 1, z: 1 }, 300)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();

        this.editor.selectObject(mesh);
    }

    handleCutOperation(mesh) {
        const intersectingObjects = this.findIntersectingObjects(mesh);

        if (intersectingObjects.length === 0) {
            this.editor.showStatus('Нет пересекающихся объектов для вырезания', 'warning');
            this.handleNewOperation(mesh);
            return;
        }

        if (!this.editor.booleanOps) {
            this.editor.showStatus('Булевы операции не доступны', 'error');
            this.handleNewOperation(mesh);
            return;
        }

        let operationSuccess = false;

        intersectingObjects.forEach(targetObject => {
            try {
                const result = this.editor.booleanOps.subtract(targetObject, mesh);
                if (result && result.geometry && result.geometry.attributes.position.count > 0) {
                    this.replaceObjectWithResult(targetObject, result, 'cut');
                    operationSuccess = true;
                }
            } catch (error) {
                console.error('Ошибка вырезания:', error);
            }
        });

        if (!operationSuccess) {
            this.editor.showStatus('Не удалось выполнить вырезание', 'error');
            this.handleNewOperation(mesh);
        }
    }

    handleJoinOperation(mesh) {
        const intersectingObjects = this.findIntersectingObjects(mesh);

        if (intersectingObjects.length === 0) {
            this.editor.showStatus('Нет пересекающихся объектов для соединения', 'warning');
            this.handleNewOperation(mesh);
            return;
        }

        if (!this.editor.booleanOps) {
            this.editor.showStatus('Булевы операции не доступны', 'error');
            this.handleNewOperation(mesh);
            return;
        }

        try {
            const objectsToUnion = [...intersectingObjects, mesh];
            const result = this.editor.booleanOps.unionMultiple(objectsToUnion);

            if (result && result.geometry && result.geometry.attributes.position.count > 0) {
                this.replaceObjectsWithResult(objectsToUnion, result, 'join');
            } else {
                throw new Error('Результат объединения пуст');
            }
        } catch (error) {
            console.error('Ошибка соединения:', error);
            this.editor.showStatus('Не удалось выполнить соединение', 'error');
            this.handleNewOperation(mesh);
        }
    }

    findIntersectingObjects(mesh) {
        const intersectingObjects = [];
        const bbox1 = new THREE.Box3().setFromObject(mesh);

        this.editor.objects.forEach(obj => {
            if (obj === mesh || obj.userData.type === 'sketch_plane' ||
                obj.userData.type === 'work_plane' ||
                obj.userData.type === 'sketch_element' ||
                obj.userData.type === 'extrusion') {
                return;
            }

            const bbox2 = new THREE.Box3().setFromObject(obj);
            if (bbox1.intersectsBox(bbox2)) {
                intersectingObjects.push(obj);
            }
        });

        return intersectingObjects;
    }

    replaceObjectWithResult(originalObject, result, operationType) {
        const originalIndex = this.editor.objects.indexOf(originalObject);
        if (originalIndex > -1) {
            this.editor.objectsGroup.remove(originalObject);
            this.editor.objects.splice(originalIndex, 1);

            if (originalObject.geometry) originalObject.geometry.dispose();
            if (originalObject.material) originalObject.material.dispose();
        }

        result.userData = {
            ...result.userData,
            type: 'boolean_result',
            operation: operationType,
            originalObjects: [originalObject.uuid],
            createdAt: new Date().toISOString()
        };

        this.editor.objectsGroup.add(result);
        this.editor.objects.push(result);

        result.scale.set(0.1, 0.1, 0.1);
        new TWEEN.Tween(result.scale)
            .to({ x: 1, y: 1, z: 1 }, 300)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();

        this.editor.selectObject(result);
    }

    replaceObjectsWithResult(originalObjects, result, operationType) {
        originalObjects.forEach(obj => {
            const index = this.editor.objects.indexOf(obj);
            if (index > -1) {
                this.editor.objectsGroup.remove(obj);
                this.editor.objects.splice(index, 1);

                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            }
        });

        result.userData = {
            ...result.userData,
            type: 'boolean_result',
            operation: operationType,
            originalObjects: originalObjects.map(o => o.uuid),
            createdAt: new Date().toISOString()
        };

        this.editor.objectsGroup.add(result);
        this.editor.objects.push(result);

        result.scale.set(0.1, 0.1, 0.1);
        new TWEEN.Tween(result.scale)
            .to({ x: 1, y: 1, z: 1 }, 300)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();

        this.editor.selectObject(result);
    }

    createExtrusionMesh(geometry, height, direction, sourceContours) {
        if (!geometry) return null;

        const material = new THREE.MeshPhongMaterial({
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (sourceContours.length === 0) return mesh;

        const firstContour = sourceContours[0];
        const sketchPlane = this.findSketchPlaneForElement(firstContour);

        if (sketchPlane) {
            // Позиционируем меш на плоскости
            const planeWorldPos = new THREE.Vector3();
            sketchPlane.getWorldPosition(planeWorldPos);

            mesh.position.copy(planeWorldPos);
            mesh.quaternion.copy(sketchPlane.quaternion);

            // Применяем небольшое смещение для корректного отображения
            const planeNormal = new THREE.Vector3(0, 0, 1);
            planeNormal.applyQuaternion(sketchPlane.quaternion);
            planeNormal.normalize();

            if (direction === 'negative') {
                // Для отрицательного направления немного поднимаем
                mesh.position.add(planeNormal.clone().multiplyScalar(0.1));
            } else if (direction === 'both') {
                // Для обоих направлений оставляем как есть
            } else {
                // Для положительного направления немного опускаем
                mesh.position.add(planeNormal.clone().multiplyScalar(0.1));
            }
        }

        mesh.userData = {
            type: 'extrusion',
            sourceContourIds: sourceContours.map(c => c.uuid),
            elementTypes: sourceContours.map(c => c.userData.elementType),
            height: height,
            direction: direction,
            operation: this.currentOperation,
            name: `Вытягивание (${height} мм)`,
            sourceCount: sourceContours.length,
            createdAt: new Date().toISOString()
        };

        return mesh;
    }


    showExtrudeUI() {
        const oldUI = document.getElementById('extrudeUI');
        if (oldUI) oldUI.remove();

        const selectedCount = this.getSelectedContours().length;

        const container = document.createElement('div');
        container.id = 'extrudeUI';
        container.className = 'extrude-ui';
        container.innerHTML = `
            <div class="extrude-header">
                <h3><i class="fas fa-arrows-alt-v"></i> Вытягивание скетча</h3>
                <button id="cancelExtrude" class="btn-secondary">
                    <i class="fas fa-times"></i> Отмена
                </button>
            </div>
            <div class="extrude-controls">
                <div class="control-group">
                    <label>Высота (мм):</label>
                    <input type="number" id="extrudeHeight" value="10" step="0.1" style="width: 100px;">

                </div>
                <div class="control-group">
                    <label>Направление:</label>
                    <select id="extrudeDirection">
                        <option value="positive">Наружу (по нормали)</option>
                        <option value="negative">Внутрь (против нормали)</option>
                        <option value="both">В обе стороны</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Операция:</label>
                    <select id="extrudeOperation">
                        <option value="new">Новый объект</option>
                        <option value="cut">Вырезать из существующих</option>
                        <option value="join">Объединить с существующими</option>
                    </select>
                </div>
                <div class="extrude-info">
                    <div id="selectedContourInfo" style="font-size: 12px; margin: 10px 0;">
                        ${selectedCount > 0 ? `✓ Выбрано контуров: ${selectedCount}` : 'Выберите контур(ы) (Ctrl+клик для множественного выбора)'}
                    </div>
                    <div id="operationHint" style="font-size: 11px; color: #888; margin: 5px 0;">
                        ${selectedCount > 0 ? this.getOperationHint() : ''}
                    </div>
                </div>
                <button id="performExtrude" class="btn-primary" ${selectedCount > 0 ? '' : 'disabled'}>
                    <i class="fas fa-check"></i> ${this.getOperationButtonText()}
                </button>
            </div>
            <div class="extrude-hint">
                <i class="fas fa-info-circle"></i>
                <div>• Перетаскивайте зеленую стрелку для изменения высоты</div>
                <div>• Или используйте кнопку <i class="fas fa-arrows-alt-v"></i> для ручного ввода</div>
            </div>
        `;

        document.querySelector('.viewport-container').appendChild(container);

        container.querySelector('#cancelExtrude').addEventListener('click', () => {
            this.cancelExtrudeMode();
        });

        container.querySelector('#performExtrude').addEventListener('click', () => {
            this.performExtrude();
        });

//        container.querySelector('#dragHeightBtn').addEventListener('click', () => {
//            const heightInput = document.getElementById('extrudeHeight');
//            const newHeight = prompt('Введите высоту (мм):', heightInput.value);
//            if (newHeight && !isNaN(parseFloat(newHeight))) {
//                heightInput.value = parseFloat(newHeight).toFixed(1);
//                this.updateExtrudePreview();
//            }
//        });

        const heightInput = container.querySelector('#extrudeHeight');
        heightInput.addEventListener('input', (e) => {
            this.updateExtrudePreview();

            const btn = document.querySelector('#performExtrude');
            if (btn && !btn.disabled) {
                const height = parseFloat(e.target.value) || 10;
                btn.innerHTML = `<i class="fas fa-check"></i> ${this.getOperationButtonText(height)}`;
            }
        });

        const directionSelect = container.querySelector('#extrudeDirection');
        directionSelect.addEventListener('change', () => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
        });

        const operationSelect = container.querySelector('#extrudeOperation');
        operationSelect.addEventListener('change', () => {
            this.currentOperation = operationSelect.value;
            this.updateOperationHint();
            this.updateExtrudeUI();
        });
    }

    getOperationHint() {
        const operation = document.getElementById('extrudeOperation')?.value || 'new';
        const hints = {
            'new': 'Создаст новый отдельный объект',
            'cut': 'Вырежет из пересекающихся объектов',
            'join': 'Объединит с пересекающимися объектами'
        };
        return hints[operation] || '';
    }

    getOperationButtonText(height = null) {
        const operation = document.getElementById('extrudeOperation')?.value || 'new';
        const selectedCount = this.getSelectedContours().length;
        const heightStr = height ? `${height.toFixed(1)} мм` : '';

        const texts = {
            'new': `Создать ${selectedCount > 1 ? `(${selectedCount} шт.)` : ''} ${heightStr}`,
            'cut': `Вырезать ${selectedCount > 1 ? `(${selectedCount} шт.)` : ''} ${heightStr}`,
            'join': `Объединить ${selectedCount > 1 ? `(${selectedCount} шт.)` : ''} ${heightStr}`
        };

        return texts[operation] || 'Выполнить';
    }

    updateOperationHint() {
        const hintElement = document.getElementById('operationHint');
        if (hintElement) {
            hintElement.textContent = this.getOperationHint();
        }
    }

    updateExtrudeUI() {
        const selectedContourInfo = document.getElementById('selectedContourInfo');
        const performExtrudeBtn = document.getElementById('performExtrude');
        const operationHint = document.getElementById('operationHint');

        if (selectedContourInfo) {
            const selectedCount = this.getSelectedContours().length;
            selectedContourInfo.textContent = selectedCount > 0 ?
                `✓ Выбрано контуров: ${selectedCount}` :
                'Выберите контур(ы) (Ctrl+клик для множественного выбора)';
            selectedContourInfo.style.color = selectedCount > 0 ? '#4CAF50' : '#888';
        }

        if (operationHint) {
            operationHint.textContent = this.getOperationHint();
        }

        if (performExtrudeBtn) {
            const selectedCount = this.getSelectedContours().length;
            performExtrudeBtn.disabled = selectedCount === 0;

            if (selectedCount > 0) {
                const height = document.getElementById('extrudeHeight')?.value || 10;
                performExtrudeBtn.innerHTML = `<i class="fas fa-check"></i> ${this.getOperationButtonText(parseFloat(height))}`;
            }
        }
    }

   highlightContoursOnHover(event) {
        if (this.dragging) return;

        this.editor.updateMousePosition(event);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Сначала проверяем, не навели ли мы на кончик стрелки
        if (this.editor.extrudeArrow) {
            const draggableParts = [];

            this.editor.extrudeArrow.traverse((child) => {
                if (child.userData && child.userData.isDraggable) {
                    draggableParts.push(child);
                }
            });

            if (draggableParts.length > 0) {
                const intersects = this.editor.raycaster.intersectObjects(draggableParts, true);

                if (intersects.length > 0) {
                    console.log('Наведение на кончик стрелки обнаружено');
                    document.body.style.cursor = 'move';
                    return;
                }
            }
        }

        // Получаем все скетч-элементы
        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        const closedElements = allSketchElements.filter(element =>
            this.isSketchElementClosed(element)
        );

        const selectedContours = this.getSelectedContours();

        // Убираем подсветку с элементов
        allSketchElements.forEach(element => {
            if (!selectedContours.includes(element) && element.userData.hoverHighlighted) {
                if (element.userData.originalColor) {
                    const tempMaterial = element.material.clone();
                    tempMaterial.color.copy(element.userData.originalColor);
                    element.material = tempMaterial;
                    element.material.needsUpdate = true;
                }
                element.userData.hoverHighlighted = false;
            }
        });

        // Проверяем пересечение с ЗАМКНУТЫМИ элементами
        const intersects = this.editor.raycaster.intersectObjects(closedElements, false);

        if (intersects.length > 0) {
            const element = intersects[0].object;

            // Проверяем, не является ли этот элемент вложенным
            const isNested = this.isContourNested(element, closedElements);

            // Для вложенных элементов показываем специальный курсор
            if (isNested) {
                document.body.style.cursor = 'crosshair';

                if (!selectedContours.includes(element) && !element.userData.hoverHighlighted) {
                    element.userData.hoverHighlighted = true;

                    if (!element.userData.originalColor) {
                        element.userData.originalColor = element.material.color.clone();
                    }

                    const tempMaterial = element.material.clone();
                    tempMaterial.color.setHex(0xFFA500); // Оранжевый для вложенных контуров
                    element.material = tempMaterial;
                    element.material.needsUpdate = true;
                }
            } else {
                document.body.style.cursor = 'pointer';

                if (!selectedContours.includes(element) && !element.userData.hoverHighlighted) {
                    element.userData.hoverHighlighted = true;

                    if (!element.userData.originalColor) {
                        element.userData.originalColor = element.material.color.clone();
                    }

                    const tempMaterial = element.material.clone();
                    tempMaterial.color.setHex(0xFFFF00);
                    element.material = tempMaterial;
                    element.material.needsUpdate = true;
                }
            }
        } else {
            document.body.style.cursor = 'default';
        }
    }




    cancelExtrudeMode() {
        this.editor.extrudeMode = false;

        this.clearContourSelection();

        if (this.editor.extrudeArrow) {
            if (this.editor.extrudeArrow.parent) {
                this.editor.extrudeArrow.parent.remove(this.editor.extrudeArrow);
            }
            this.editor.extrudeArrow = null;
            this.arrowHandle = null;
        }

        if (this.extrudePreviewGroup) {
            this.editor.objectsGroup.remove(this.extrudePreviewGroup);
            this.extrudePreviewGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.extrudePreviewGroup = null;
        }

        // Удаляем глобальные обработчики
        this.unbindGlobalDragHandlers();

        const ui = document.getElementById('extrudeUI');
        if (ui) ui.remove();

        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        allSketchElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        document.body.style.cursor = 'default';
        this.dragging = false;

        this.editor.showStatus('Режим выдавливания завершен', 'info');
    }
}