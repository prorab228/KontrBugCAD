
class MoveTool extends TransformToolBase {
    constructor(editor) {
        super('move', 'fa-arrows-alt', editor);
        this.useLocalCoordinates = false; // По умолчанию глобальные координаты
        
        // Для визуализации перемещения
        this.moveLine = null;
        this.moveLineGeometry = null;
        this.moveLineMaterial = null;
        this.distanceText = null;
        this.distanceTextSprite = null;
        this.startWorldPosition = new THREE.Vector3();
        this.showMoveLine = true; // Флаг для отображения линии
        this.lineThickness = 0.3; // Толщина линии в 3D
        
        // Размеры стрелок
        this.arrowBaseLength = 7.0; // Базовая длина линии стрелки (используется только для создания)
        this.arrowHeadBaseLength = 1.5; // Длина конуса
        this.arrowHeadBaseRadius = 1; // Радиус конуса
        this.lineBaseRadius = 0.05; // Радиус линии
        this.minArrowLength = 2.0; // Минимальная длина стрелки
        this.arrowOffset = 2.0; // Выступ стрелки за пределы объекта (мм)

        // Ссылки на созданные стрелки
        this.axisArrows = {
            x: { line: null, cone: null, group: null },
            y: { line: null, cone: null, group: null },
            z: { line: null, cone: null, group: null }
        };

        this.initGizmo();
    }

    initGizmo() {
        // Очищаем предыдущий gizmo
        while (this.gizmoGroup.children.length > 0) {
            const child = this.gizmoGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.gizmoGroup.remove(child);
        }

        this.createTranslateGizmo();
        this.gizmoGroup.visible = false;
        
        // Инициализируем линию перемещения (пока не добавляем в сцену)
        this.initMoveLine();
    }

    initMoveLine() {
        // Создаем геометрию для объемной линии (цилиндр вместо тонкой линии)
        this.moveLineGeometry = new THREE.CylinderGeometry(
            this.lineThickness / 2, // радиус сверху
            this.lineThickness / 2, // радиус снизу
            1, // высота (будем масштабировать)
            8, // количество сегментов
            1, // количество сегментов высоты
            false // закрытые концы
        );
        
        // Создаем материал для линии
        this.moveLineMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00, // Зеленый цвет
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide // Отображаем с обеих сторон
        });
        
        // Создаем меш линии
        this.moveLine = new THREE.Mesh(this.moveLineGeometry, this.moveLineMaterial);
        this.moveLine.name = 'move_tool_line';
        this.moveLine.visible = false;
        this.moveLine.renderOrder = 1000; // Чтобы линия была поверх других объектов
        
        // Добавляем в сцену
        this.editor.scene.add(this.moveLine);
        
        // Создаем группу для текста (пока без самой текстуры)
        this.distanceText = new THREE.Group();
        this.distanceText.name = 'move_tool_distance_text';
        this.distanceText.visible = false;
        this.editor.scene.add(this.distanceText);
    }


     createTranslateGizmo() {
        // Сбрасываем ссылки на стрелки
        this.axisArrows = {
            x: { line: null, cone: null, group: null },
            y: { line: null, cone: null, group: null },
            z: { line: null, cone: null, group: null }
        };

        ['x', 'y', 'z'].forEach(axis => {
            const axisGroup = new THREE.Group();
            axisGroup.name = `translate_${axis}`;
            axisGroup.userData.type = 'translate';
            axisGroup.userData.axis = axis;

            // Сохраняем ссылку на группу
            this.axisArrows[axis].group = axisGroup;

            // Линия оси
            const lineGeometry = new THREE.CylinderGeometry(
                this.lineBaseRadius,
                this.lineBaseRadius,
                this.arrowBaseLength,
                8
            );
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.name = `translate_line_${axis}`;
            line.userData.axis = axis;

            // Сохраняем ссылку на линию
            this.axisArrows[axis].line = line;

            // Конус стрелки
            const coneGeometry = new THREE.ConeGeometry(
                this.arrowHeadBaseRadius,
                this.arrowHeadBaseLength,
                8
            );
            const coneMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });
            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.name = `translate_cone_${axis}`;
            cone.userData.axis = axis;

            // Сохраняем ссылку на конус
            this.axisArrows[axis].cone = cone;

            // Позиционирование - базовая позиция
            if (axis === 'x') {
                line.rotation.z = -Math.PI / 2;
                line.position.x = this.arrowBaseLength / 2;
                cone.rotation.z = -Math.PI / 2;
                cone.position.x = this.arrowBaseLength + this.arrowHeadBaseLength / 2;
            } else if (axis === 'y') {
                line.position.y = this.arrowBaseLength / 2;
                cone.position.y = this.arrowBaseLength + this.arrowHeadBaseLength / 2;
            } else if (axis === 'z') {
                line.rotation.x = Math.PI / 2;
                line.position.z = this.arrowBaseLength / 2;
                cone.rotation.x = Math.PI / 2;
                cone.position.z = this.arrowBaseLength + this.arrowHeadBaseLength / 2;
            }

            axisGroup.add(line);
            axisGroup.add(cone);
            this.gizmoGroup.add(axisGroup);
        });
    }

    getPropertiesHTML() {
        console.log('MoveTool: создание HTML свойств');
        return `
            <div class="property-group" data-type="move-position">
                <h4><i class="fas fa-arrows-alt"></i> Позиция (мм)</h4>

                <div class="property-row">
                    <label>Локальные координаты:</label>
                    <input type="checkbox" id="localCoordinates" ${this.useLocalCoordinates ? 'checked' : ''}>
                </div>
                
                <div class="property-row">
                    <label>Показывать линию перемещения:</label>
                    <input type="checkbox" id="showMoveLine" ${this.showMoveLine ? 'checked' : ''}>
                </div>
                
                <div class="property-row">
                    <label>Толщина линии:</label>
                    <input type="range" id="lineThickness" min="0.1" max="2" step="0.1" value="${this.lineThickness}">
                    <span id="thicknessValue">${this.lineThickness.toFixed(1)}</span>
                </div>

                <div class="property-row">
                    <label>X:</label>
                    <input type="number" id="movePosX" step="any" value="0">
                </div>
                <div class="property-row">
                    <label>Y:</label>
                    <input type="number" id="movePosY" step="any" value="0">
                </div>
                <div class="property-row">
                    <label>Z:</label>
                    <input type="number" id="movePosZ" step="any" value="0">
                </div>
                <div class="property-row">
                    <button id="applyMovePosition" class="btn-small">
                        <i class="fas fa-check"></i> Применить позицию
                    </button>
                </div>
            </div>
        `;
    }

    bindPropertiesEvents() {
        if (!this.propertiesElement) {
            console.log('MoveTool: propertiesElement отсутствует');
            return;
        }

        console.log('MoveTool: привязка событий');

        const posX = this.propertiesElement.querySelector('#movePosX');
        const posY = this.propertiesElement.querySelector('#movePosY');
        const posZ = this.propertiesElement.querySelector('#movePosZ');
        const applyBtn = this.propertiesElement.querySelector('#applyMovePosition');
        const localCoordsCheckbox = this.propertiesElement.querySelector('#localCoordinates');
        const showMoveLineCheckbox = this.propertiesElement.querySelector('#showMoveLine');
        const thicknessSlider = this.propertiesElement.querySelector('#lineThickness');
        const thicknessValue = this.propertiesElement.querySelector('#thicknessValue');

        if (posX) {
            posX.addEventListener('change', (e) => this.onPositionChange('x', e));
            posX.addEventListener('input', (e) => this.onPositionChange('x', e));
        }
        if (posY) {
            posY.addEventListener('change', (e) => this.onPositionChange('y', e));
            posY.addEventListener('input', (e) => this.onPositionChange('y', e));
        }
        if (posZ) {
            posZ.addEventListener('change', (e) => this.onPositionChange('z', e));
            posZ.addEventListener('input', (e) => this.onPositionChange('z', e));
        }
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyPositionFromInputs());
        }
        if (localCoordsCheckbox) {
            localCoordsCheckbox.checked = this.useLocalCoordinates;
            localCoordsCheckbox.addEventListener('change', (e) => {
                this.useLocalCoordinates = e.target.checked;
                this.updateGizmoPosition();
            });
        }
        if (showMoveLineCheckbox) {
            showMoveLineCheckbox.checked = this.showMoveLine;
            showMoveLineCheckbox.addEventListener('change', (e) => {
                this.showMoveLine = e.target.checked;
                // Если линия видна и мы выключили отображение - скрываем ее
                if (!this.showMoveLine) {
                    this.hideMoveLine();
                }
            });
        }
        if (thicknessSlider) {
            thicknessSlider.value = this.lineThickness;
            thicknessSlider.addEventListener('input', (e) => {
                this.lineThickness = parseFloat(e.target.value);
                if (thicknessValue) {
                    thicknessValue.textContent = this.lineThickness.toFixed(1);
                }
                // Обновляем существующую линию
                if (this.moveLine && this.moveLine.visible) {
                    this.updateLineThickness();
                }
            });
        }
    }

    updateLineThickness() {
        if (!this.moveLine || !this.moveLine.geometry) return;
        
        // Создаем новую геометрию с нужной толщиной
        const newGeometry = new THREE.CylinderGeometry(
            this.lineThickness / 2,
            this.lineThickness / 2,
            1,
            8,
            1,
            false
        );
        
        // Заменяем геометрию
        this.moveLine.geometry.dispose();
        this.moveLine.geometry = newGeometry;
        
        // Масштабируем линию
        if (this.startWorldPosition && this.attachedObject) {
            const currentWorldPos = new THREE.Vector3();
            this.attachedObject.getWorldPosition(currentWorldPos);
            this.updateLineTransform(this.startWorldPosition, currentWorldPos);
        }
    }

    hideMoveLine() {
        if (this.moveLine) {
            this.moveLine.visible = false;
        }
        if (this.distanceText) {
            this.distanceText.visible = false;
        }
    }

    onPositionChange(axis, e) {
        if (!this.attachedObject) return;

        const value = parseFloat(e.target.value);
        if (isNaN(value)) return;

        // Скрываем линию при изменении позиции через инпут
        this.hideMoveLine();

        this.attachedObject.position[axis] = value;
        this.updateGizmoPosition();
    }

    applyPositionFromInputs() {
        if (!this.propertiesElement || !this.attachedObject) return;

        const posX = parseFloat(this.propertiesElement.querySelector('#movePosX').value);
        const posY = parseFloat(this.propertiesElement.querySelector('#movePosY').value);
        const posZ = parseFloat(this.propertiesElement.querySelector('#movePosZ').value);

        if (isNaN(posX) || isNaN(posY) || isNaN(posZ)) {
            this.editor.showStatus('Некорректные значения позиции', 'error');
            return;
        }

        // Скрываем линию
        this.hideMoveLine();

        const previousPosition = this.attachedObject.position.clone();
        this.attachedObject.position.set(posX, posY, posZ);
        this.updateGizmoPosition();

        this.editor.history.addAction({
            type: 'modify_position',
            object: this.attachedObject.uuid,
            data: {
                position: this.attachedObject.position.toArray(),
                previousPosition: previousPosition.toArray()
            }
        });

        this.editor.showStatus(`Позиция установлена: ${posX}, ${posY}, ${posZ}`, 'success');
    }

    updatePropertiesValues() {
        if (!this.propertiesElement || !this.attachedObject) return;

        const posX = this.propertiesElement.querySelector('#movePosX');
        const posY = this.propertiesElement.querySelector('#movePosY');
        const posZ = this.propertiesElement.querySelector('#movePosZ');

        if (posX) posX.value = this.attachedObject.position.x.toFixed(2);
        if (posY) posY.value = this.attachedObject.position.y.toFixed(2);
        if (posZ) posZ.value = this.attachedObject.position.z.toFixed(2);
    }

    startDragging(axis, e) {
        super.startDragging(axis, e);

        if (this.attachedObject) {
            this.moveDelta.set(0, 0, 0);

            // Создаем плоскость для перемещения
            const cameraDirection = this.editor.camera.getWorldDirection(new THREE.Vector3());
            let planeNormal;

            if (axis === 'x') planeNormal = new THREE.Vector3(0, 1, 0);
            else if (axis === 'y') planeNormal = new THREE.Vector3(0, 0, 1);
            else if (axis === 'z') planeNormal = new THREE.Vector3(1, 0, 0);

            if (planeNormal) {
                this.dragPlane = new THREE.Plane();
                this.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, this.gizmoGroup.position);
            }
            
            // Сохраняем начальную мировую позицию для линии
            this.attachedObject.getWorldPosition(this.startWorldPosition);
            
            // Настраиваем линию перемещения
            this.setupMoveLine();
        }
    }

    setupMoveLine() {
        if (!this.moveLine || !this.showMoveLine) return;
        
        // Обновляем толщину линии
        this.updateLineThickness();
        
        // Показываем линию
        this.moveLine.visible = true;
        
        // Настраиваем материал в зависимости от оси
        if (this.currentAxis === 'x') {
            this.moveLineMaterial.color.setHex(0xff4444); // Красный для X
        } else if (this.currentAxis === 'y') {
            this.moveLineMaterial.color.setHex(0x44ff44); // Зеленый для Y
        } else if (this.currentAxis === 'z') {
            this.moveLineMaterial.color.setHex(0x4444ff); // Синий для Z
        }
    }

    updateLineTransform(startPos, endPos) {
        if (!this.moveLine || !this.moveLine.visible) return;
        
        // Вычисляем середину между точками
        const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
        
        // Вычисляем длину между точками
        const distance = startPos.distanceTo(endPos);
        
        // Вычисляем направление от start к end
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        
        // Устанавливаем позицию линии в середину
        this.moveLine.position.copy(midPoint);
        
        // Масштабируем линию по длине
        this.moveLine.scale.set(1, distance, 1);
        
        // Поворачиваем линию, чтобы она указывала в правильном направлении
        if (direction.length() > 0) {
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            this.moveLine.quaternion.copy(quaternion);
        }
        
        // Обновляем или создаем текст расстояния
        this.updateDistanceText(midPoint, distance, direction);
    }

    updateDistanceText(position, distance, direction) {
        if (!this.distanceText) return;
        
        // Очищаем предыдущий текст
        while (this.distanceText.children.length > 0) {
            const child = this.distanceText.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.distanceText.remove(child);
        }
        
        // Показываем текст только если есть расстояние
        if (distance < 0.1) {
            this.distanceText.visible = false;
            return;
        }
        
        // Создаем текстовую канву
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const text = `${distance.toFixed(1)} мм`;
        
        // Настройки текста - увеличен размер
        const fontSize = 42; // Увеличенный размер шрифта
        const padding = 10;
        
        // Измеряем текст
        context.font = ` ${fontSize}px Arial`;
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;
        
        // Устанавливаем размеры канвы (с запасом)
        canvas.width = textWidth + padding * 2;
        canvas.height = textHeight + padding * 2;
        
        // Очищаем канву (полностью прозрачный фон)
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Рисуем текст с черной обводкой для лучшей видимости
        context.font = ` ${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Черная обводка
        context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        context.lineWidth = 2;
        context.strokeText(text, canvas.width / 2, canvas.height / 2);
        
        // Белый текст
        context.fillStyle = '#AAAAAA';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Создаем текстуру из канвы
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.premultiplyAlpha = true; // Для правильного смешивания прозрачности
        
        // Создаем материал спрайта с прозрачностью
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0, // Полная непрозрачность, но фон уже прозрачный
            depthTest: false // Всегда поверх
        });
        
        // Создаем спрайт
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Увеличиваем размер спрайта - адаптивный размер
        const cameraDistance = this.editor.camera.position.distanceTo(position);
        const scaleFactor = 0.03 * cameraDistance; // Размер зависит от расстояния до камеры
        const aspectRatio = canvas.width / canvas.height;
        sprite.scale.set(aspectRatio * scaleFactor, scaleFactor, 1);
        
        // Позиционируем спрайт немного в стороне от линии
        // Вычисляем перпендикулярное направление
        let perpDirection;
        if (Math.abs(direction.y) > 0.9) {
            perpDirection = new THREE.Vector3(1, 0, 0);
        } else {
            perpDirection = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
        }
        
        // Смещаем текст на большее расстояние от линии (чтобы не перекрывался)
        const offset = perpDirection.multiplyScalar(2.5 + cameraDistance * 0.01); // Динамическое смещение
        sprite.position.copy(offset);
        
        // Добавляем спрайт в группу
        this.distanceText.add(sprite);
        
        // Позиционируем группу
        this.distanceText.position.copy(position);
        
        // Ориентируем текст к камере
        this.distanceText.lookAt(this.editor.camera.position);
        
        // Поворачиваем текст на 180 градусов, чтобы он был читаемым
        this.distanceText.rotateY(Math.PI);
        
        this.distanceText.visible = true;
    }

    updateMoveLine() {
        if (!this.moveLine || !this.attachedObject || !this.moveLine.visible || !this.showMoveLine) return;
        
        // Получаем текущую мировую позицию объекта
        const currentWorldPos = new THREE.Vector3();
        this.attachedObject.getWorldPosition(currentWorldPos);
        
        // Обновляем трансформацию линии
        this.updateLineTransform(this.startWorldPosition, currentWorldPos);
        
        // Вычисляем длину перемещения
        const distance = this.startWorldPosition.distanceTo(currentWorldPos);
        
        // Обновляем tooltip с информацией о расстоянии
        this.updateTooltipWithDistance(distance);
    }

    updateTooltipWithDistance(distance) {
        if (!this.tooltip) return;
        
        // Добавляем информацию о расстоянии к существующему tooltip
        const existingContent = this.getTooltipContent();
        const distanceInfo = `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 10px; opacity: 0.8;">Общее расстояние:</span>
                    <span style="font-weight: bold; color: #ffd43b;">${distance.toFixed(2)} мм</span>
                </div>
            </div>
        `;
        
        this.tooltip.innerHTML = existingContent + distanceInfo;
    }

    handleTransform(deltaX, deltaY) {
        if (!this.attachedObject || !this.currentAxis || !this.dragPlane) return;

        // Вместо неправильного расчета луча используем правильную технику
        const rect = this.editor.renderer.domElement.getBoundingClientRect();

        // Текущие координаты мыши
        const currentMouseX = this.startMouse.x + deltaX;
        const currentMouseY = this.startMouse.y + deltaY;

        // Преобразуем в нормализованные координаты (-1 до 1)
        const x = ((currentMouseX - rect.left) / rect.width) * 2 - 1;
        const y = -((currentMouseY - rect.top) / rect.height) * 2 + 1;

        // Создаем луч из камеры через текущую позицию мыши
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), this.editor.camera);

        // Находим пересечение с плоскостью
        const intersection = new THREE.Vector3();
        if (ray.ray.intersectPlane(this.dragPlane, intersection)) {
            // Начальный луч (в момент начала перетаскивания)
            const startX = ((this.startMouse.x - rect.left) / rect.width) * 2 - 1;
            const startY = -((this.startMouse.y - rect.top) / rect.height) * 2 + 1;

            const startRay = new THREE.Raycaster();
            startRay.setFromCamera(new THREE.Vector2(startX, startY), this.editor.camera);

            const startIntersection = new THREE.Vector3();
            if (startRay.ray.intersectPlane(this.dragPlane, startIntersection)) {
                // Вычисляем дельту перемещения
                const delta = new THREE.Vector3().subVectors(intersection, startIntersection);

                // Применяем перемещение только по выбранной оси
                let moveVector = new THREE.Vector3();

                // Получаем локальные оси из вращения gizmo
                const axisVector = this.getAxisVector(this.currentAxis);

                // Проецируем дельту на выбранную ось
                const projection = delta.dot(axisVector);
                moveVector.copy(axisVector).multiplyScalar(projection);

                // Применяем привязку к сетке, если не зажат Ctrl
                if (this.snapEnabled && !this.editor.spacePressed) {
                    moveVector.x = Math.round(moveVector.x / this.moveSnapValue) * this.moveSnapValue;
                    moveVector.y = Math.round(moveVector.y / this.moveSnapValue) * this.moveSnapValue;
                    moveVector.z = Math.round(moveVector.z / this.moveSnapValue) * this.moveSnapValue;
                }

                // Применяем перемещение
                this.attachedObject.position.copy(this.startPosition).add(moveVector);
                this.moveDelta.copy(moveVector);

                // Обновляем позицию gizmo
                this.updateGizmoPosition();
                
                // Обновляем линию перемещения
                this.updateMoveLine();
            }
        }
    }

    updateGizmoPosition() {
        if (!this.attachedObject) return;

        // Получаем мировую позицию объекта
        const worldPos = new THREE.Vector3();
        this.attachedObject.getWorldPosition(worldPos);
        this.gizmoGroup.position.copy(worldPos);

        // Обновляем вращение gizmo в зависимости от системы координат
        if (this.useLocalCoordinates) {
            this.gizmoGroup.quaternion.copy(this.attachedObject.quaternion);
        } else {
            this.gizmoGroup.quaternion.identity();
        }

        // Получаем размеры объекта
        const box = new THREE.Box3().setFromObject(this.attachedObject);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Сбрасываем общий масштаб группы
        this.gizmoGroup.scale.set(1, 1, 1);

        // Масштабируем каждую стрелку отдельно в зависимости от размера объекта по соответствующей оси
        ['x', 'y', 'z'].forEach(axis => {
            const arrowData = this.axisArrows[axis];
            if (!arrowData.group) return;

            // Определяем размер по соответствующей оси
            let axisSize;
            if (axis === 'x') axisSize = size.x;
            else if (axis === 'y') axisSize = size.y;
            else axisSize = size.z;

            // Вычисляем желаемую общую длину стрелки: половина размера объекта по оси + выступ
            let desiredTotalLength = (axisSize / 2) + this.arrowOffset;

            // Обеспечиваем минимальную длину
            desiredTotalLength = Math.max(this.minArrowLength, desiredTotalLength);

            // Вычисляем длину линии: общая длина минус половина длины конуса
            let lineLength = desiredTotalLength - (this.arrowHeadBaseLength / 2);

            // Если длина линии слишком мала, уменьшаем общую длину
            if (lineLength < 0) {
                lineLength = 0;
                desiredTotalLength = this.arrowHeadBaseLength / 2;
            }

            // Вычисляем масштаб для линии
            const lineScale = lineLength / this.arrowBaseLength;

            // Получаем ссылки на линию и конус
            const line = arrowData.line;
            const cone = arrowData.cone;

            if (line && cone) {
                // Обновляем позиции и масштабы в зависимости от оси
                if (axis === 'x') {
                    // Линия: масштабируем только по оси X (длине)
                    line.position.x = lineLength / 2;
                    line.scale.x = lineScale;

                    // Конус: фиксированный размер, позиция = lineLength + arrowHeadBaseLength/2
                    cone.position.x = desiredTotalLength;
                    cone.scale.set(1, 1, 1); // Конус не масштабируем

                } else if (axis === 'y') {
                    line.position.y = lineLength / 2;
                    line.scale.y = lineScale;

                    cone.position.y = desiredTotalLength;
                    cone.scale.set(1, 1, 1);

                } else if (axis === 'z') {
                    line.position.z = lineLength / 2;
                    line.scale.z = lineScale;

                    cone.position.z = desiredTotalLength;
                    cone.scale.set(1, 1, 1);
                }

                // Обновляем матрицы для корректного отображения
                line.updateMatrix();
                cone.updateMatrix();
            }
        });
    }

    // Новый метод для получения вектора оси
    getAxisVector(axis) {
        const vector = new THREE.Vector3();
        if (axis === 'x') vector.set(1, 0, 0);
        else if (axis === 'y') vector.set(0, 1, 0);
        else if (axis === 'z') vector.set(0, 0, 1);

        // Преобразуем в мировые координаты с учетом вращения gizmo
        vector.applyQuaternion(this.gizmoGroup.quaternion);
        return vector.normalize();
    }

    onMouseUp(e) {
        // Вызываем родительский метод для сохранения в историю
        super.onMouseUp(e);
        
        // Скрываем линию перемещения после завершения перетаскивания
        this.hideMoveLine();
    }

    // Переопределяем метод для очистки при откреплении объекта
    detach() {
        // Скрываем линию перемещения
        this.hideMoveLine();
        
        // Вызываем родительский метод
        super.detach();
    }

    // Переопределяем метод для очистки при деактивации инструмента
    onDeactivate() {
        // Удаляем линию перемещения и текст из сцены
        this.removeMoveLine();
        
        // Вызываем родительский метод
        super.onDeactivate();
    }

    removeMoveLine() {
        // Удаляем линию
        if (this.moveLine) {
            if (this.moveLine.parent) {
                this.moveLine.parent.remove(this.moveLine);
            }
            if (this.moveLineGeometry) {
                this.moveLineGeometry.dispose();
            }
            if (this.moveLineMaterial) {
                this.moveLineMaterial.dispose();
            }
            this.moveLine = null;
            this.moveLineGeometry = null;
            this.moveLineMaterial = null;
        }
        
        // Удаляем текст
        if (this.distanceText) {
            // Очищаем дочерние элементы
            while (this.distanceText.children.length > 0) {
                const child = this.distanceText.children[0];
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
                this.distanceText.remove(child);
            }
            
            if (this.distanceText.parent) {
                this.distanceText.parent.remove(this.distanceText);
            }
            this.distanceText = null;
        }
    }

    getTooltipContent() {
        if (!this.attachedObject) return '';

        return `
            <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">Перемещение (мм):</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <div style="color: #ff6b6b;">
                    <div style="font-size: 10px; opacity: 0.8;">ΔX</div>
                    <div>${this.moveDelta.x.toFixed(1)}</div>
                </div>
                <div style="color: #51cf66;">
                    <div style="font-size: 10px; opacity: 0.8;">ΔY</div>
                    <div>${this.moveDelta.y.toFixed(1)}</div>
                </div>
                <div style="color: #339af0;">
                    <div style="font-size: 10px; opacity: 0.8;">ΔZ</div>
                    <div>${this.moveDelta.z.toFixed(1)}</div>
                </div>
            </div>
            <div style="margin-top: 8px; font-size: 10px; opacity: 0.7; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
                Ctrl: ${this.snapEnabled ? 'с привязкой' : 'без привязки'}
            </div>
        `;
    }

    createHistoryAction() {
        if (!this.attachedObject || !this.attachedObject.userData.transformStartState) return null;

        return {
            type: 'modify_position',
            object: this.attachedObject.uuid,
            data: {
                position: this.attachedObject.position.toArray(),
                previousPosition: this.attachedObject.userData.transformStartState.position.toArray()
            }
        };
    }

    getHistoryActionType() {
        return 'modify_position';
    }
}
