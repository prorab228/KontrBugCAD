// transforms.js - ИСПРАВЛЕННАЯ ВЕРСИЯ с независимым вращением
class TransformControls {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.gizmoGroup = new THREE.Group();
        this.scene = cadEditor.scene;
        this.transformMode = 'translate';
        this.isDragging = false;
        this.currentAxis = null;
        this.startPosition = null;
        this.startRotation = null;
        this.startMouse = null;
        this.originalObjectData = null;

        // Цвета осей
        this.axisColors = {
            x: 0xff4444,
            y: 0x44ff44,
            z: 0x4444ff
        };

        // Привязка
        this.snapEnabled = true;
        this.moveSnapValue = 1.0;
        this.sizeSnapValue = 1.0;
        this.rotateSnapValue = 1 * (Math.PI / 180);

        // Векторы
        this.moveDelta = new THREE.Vector3();
        this.sizeDelta = new THREE.Vector3();
        this.startProjection = null;
        this.lastMousePosition = new THREE.Vector2();

        // Для вращения
        this.rotationPlane = null;
        this.startVector = null;
        this.accumulatedAngle = 0;

        this.worldGroup = cadEditor.worldGroup;
        this.initGizmo();
    }

    initGizmo() {
        while(this.gizmoGroup.children.length > 0) {
            this.gizmoGroup.remove(this.gizmoGroup.children[0]);
        }

        this.createTranslateGizmo();
        this.createSizeGizmo();
        this.createRotateGizmo();

        this.gizmoGroup.visible = false;
        this.scene.add(this.gizmoGroup);
    }

    createTranslateGizmo() {
        this.translateGroup = new THREE.Group();
        this.translateGroup.name = 'translate_gizmo';
        this.translateGroup.visible = false;

        const arrowLength = 10;
        const arrowHeadLength = 1;
        const coneRadius = 0.2;
        const lineRadius = 0.1;

        ['x', 'y', 'z'].forEach(axis => {
            const axisGroup = new THREE.Group();
            axisGroup.name = `translate_${axis}`;
            axisGroup.userData.type = 'translate';
            axisGroup.userData.axis = axis;

            // Линия оси
            const lineGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius, arrowLength, 8);
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.name = `translate_line_${axis}`;

            // Конус стрелки
            const coneGeometry = new THREE.ConeGeometry(coneRadius, arrowHeadLength, 8);
            const coneMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });
            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.name = `translate_cone_${axis}`;

            // Позиционирование
            const totalLength = arrowLength + arrowHeadLength;

            if (axis === 'x') {
                line.rotation.z = -Math.PI / 2;
                line.position.x = arrowLength / 2;
                cone.position.x = totalLength;
                cone.rotation.z = -Math.PI / 2;
            } else if (axis === 'y') {
                line.position.y = arrowLength / 2;
                cone.position.y = totalLength;
            } else if (axis === 'z') {
                line.rotation.x = Math.PI / 2;
                line.position.z = arrowLength / 2;
                cone.position.z = totalLength;
                cone.rotation.x = Math.PI / 2;
            }

            axisGroup.add(line);
            axisGroup.add(cone);
            this.createAxisLabel(axis, axisGroup, totalLength + 4);
            this.translateGroup.add(axisGroup);
        });

        this.gizmoGroup.add(this.translateGroup);
    }

    createSizeGizmo() {
        this.sizeGroup = new THREE.Group();
        this.sizeGroup.name = 'size_gizmo';
        this.sizeGroup.visible = false;

        const handleSize = 0.8;
        const offset = 10;

        ['x', 'y', 'z'].forEach(axis => {
            const geometry = new THREE.BoxGeometry(handleSize, handleSize, handleSize);
            const material = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });
            const cube = new THREE.Mesh(geometry, material);
            cube.name = `size_${axis}`;
            cube.userData.type = 'size';
            cube.userData.axis = axis;

            if (axis === 'x') cube.position.x = offset;
            else if (axis === 'y') cube.position.y = offset;
            else if (axis === 'z') cube.position.z = offset;

            // Линия от центра к кубу
            const lineGeometry = new THREE.CylinderGeometry(0.1, 0.1, offset, 8);
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.5
            });
            const line = new THREE.Mesh(lineGeometry, lineMaterial);

            if (axis === 'x') {
                line.rotation.z = -Math.PI / 2;
                line.position.x = offset / 2;
            } else if (axis === 'y') {
                line.position.y = offset / 2;
            } else if (axis === 'z') {
                line.rotation.x = Math.PI / 2;
                line.position.z = offset / 2;
            }

            this.sizeGroup.add(line);
            this.sizeGroup.add(cube);
            this.createAxisLabel(axis, cube, offset);
        });

        this.gizmoGroup.add(this.sizeGroup);
    }

    createRotateGizmo() {
        this.rotateGroup = new THREE.Group();
        this.rotateGroup.name = 'rotate_gizmo';
        this.rotateGroup.visible = false;

        const ringRadius = 10;
        const tubeRadius = 0.1;
        const segments = 48;

        ['x', 'y', 'z'].forEach(axis => {
            const geometry = new THREE.TorusGeometry(ringRadius, tubeRadius, 6, segments);
            const material = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            });

            const ring = new THREE.Mesh(geometry, material);
            ring.name = `rotate_${axis}`;
            ring.userData.type = 'rotate';
            ring.userData.axis = axis;

            if (axis === 'x') {
                ring.rotation.y = Math.PI / 2;
            } else if (axis === 'z') {
                // Оставляем как есть
            } else if (axis === 'y') {
                ring.rotation.x = Math.PI / 2;
            }

            this.rotateGroup.add(ring);
            this.createRotationLabel(axis, ring, ringRadius + 5);
        });

        this.gizmoGroup.add(this.rotateGroup);
    }

    createAxisLabel(axis, parent, offset) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 14px Arial';
        context.fillStyle = this.getAxisColorHex(axis);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(axis.toUpperCase(), canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(10, 10, 1);

        if (axis === 'x') sprite.position.set(offset, 0, 0);
        else if (axis === 'y') sprite.position.set(0, offset, 0);
        else if (axis === 'z') sprite.position.set(0, 0, offset);

        parent.add(sprite);
    }

    createRotationLabel(axis, parent, offset) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const context = canvas.getContext('2d');

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 24px Arial';
        context.fillStyle = this.getAxisColorHex(axis);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('R', canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(8, 4, 1);

        if (axis === 'x') sprite.position.set(offset, 0, 0);
        else if (axis === 'y') sprite.position.set(0, offset, 0);
        else if (axis === 'z') sprite.position.set(0, 0, offset);

        parent.add(sprite);
    }

    getAxisColorHex(axis) {
        const colors = {
            x: '#ff4444',
            y: '#44ff44',
            z: '#4444ff'
        };
        return colors[axis] || '#ffffff';
    }

    // ОСНОВНЫЕ МЕТОДЫ
    attach(object) {
        this.attachedObject = object;
        this.originalObjectData = {
            position: object.position.clone(),
            rotation: object.rotation.clone()
        };

        this.updatePosition();
        this.show();
        this.updateMode(this.transformMode);
    }

    detach() {
        this.attachedObject = null;
        this.originalObjectData = null;
        this.hide();
    }

    updatePosition() {
        if (this.attachedObject) {
            const worldPos = new THREE.Vector3();
            this.attachedObject.getWorldPosition(worldPos);
            this.gizmoGroup.position.copy(worldPos);
            this.gizmoGroup.rotation.copy(this.worldGroup.rotation);

            const cameraDistance = this.editor.camera.position.distanceTo(worldPos);
            const scale = cameraDistance * 0.015;
            this.gizmoGroup.scale.setScalar(scale);
        }
    }

    updateMode(mode) {
        this.transformMode = mode;
        this.translateGroup.visible = false;
        this.sizeGroup.visible = false;
        this.rotateGroup.visible = false;

        switch(mode) {
            case 'translate':
                this.translateGroup.visible = true;
                break;
            case 'scale':
                this.sizeGroup.visible = true;
                break;
            case 'rotate':
                this.rotateGroup.visible = true;
                break;
        }
    }

    // ОБРАБОТКА МЫШИ
    onMouseDown(event, mouse) {
        if (!this.attachedObject || !this.gizmoGroup.visible) return false;

        this.snapEnabled = !event.ctrlKey;
        this.updateMousePosition(event, mouse);

        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        let intersects = [];
        let gizmoGroupToCheck = null;

        switch (this.transformMode) {
            case 'translate':
                gizmoGroupToCheck = this.translateGroup;
                break;
            case 'scale':
                gizmoGroupToCheck = this.sizeGroup;
                break;
            case 'rotate':
                gizmoGroupToCheck = this.rotateGroup;
                break;
        }

        if (gizmoGroupToCheck && gizmoGroupToCheck.visible) {
            const meshes = [];
            gizmoGroupToCheck.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    meshes.push(child);
                }
            });

            intersects = this.editor.raycaster.intersectObjects(meshes, true);
        }

        if (intersects && intersects.length > 0) {
            const object = intersects[0].object;

            let currentObject = object;
            let newAxis = null;

            while (currentObject && currentObject !== gizmoGroupToCheck) {
                if (currentObject.userData && currentObject.userData.axis) {
                    newAxis = currentObject.userData.axis;
                    break;
                }
                currentObject = currentObject.parent;
            }

            if (!newAxis) {
                const name = object.name || '';
                if (name.includes('translate_')) {
                    newAxis = name.replace('translate_', '').replace('_line', '').replace('_cone', '');
                } else if (name.includes('size_')) {
                    newAxis = name.replace('size_', '');
                } else if (name.includes('rotate_')) {
                    newAxis = name.replace('rotate_', '');
                }
            }

            if (newAxis) {
                this.currentAxis = newAxis;
                this.isDragging = true;
                this.startMouse = new THREE.Vector2(mouse.x, mouse.y);
                this.startPosition = this.attachedObject.position.clone();
                this.startRotation = this.attachedObject.rotation.clone();
                this.moveDelta.set(0, 0, 0);
                this.sizeDelta.set(0, 0, 0);
                this.accumulatedAngle = 0;

                if (this.transformMode === 'scale') {
                    this.sizeStartDimensions = this.getObjectDimensions(this.attachedObject);
                    this.startProjection = this.getPlaneIntersection(mouse);
                } else if (this.transformMode === 'rotate') {
                    this.setupRotation(mouse);
                } else {
                    this.saveStartProjection(mouse);
                }

                this.createTooltip();
                return true;
            }
        }

        return false;
    }

    onMouseMove(event, mouse) {
        if (!this.isDragging || !this.attachedObject || !this.currentAxis) return;

        this.updateMousePosition(event, mouse);

        switch(this.transformMode) {
            case 'translate':
                this.handleTranslate(mouse);
                break;
            case 'scale':
                this.handleSizeChange(mouse);
                break;
            case 'rotate':
                this.handleRotate(mouse);
                break;
        }

        this.updatePosition();
        this.editor.updatePropertiesPanel();
        this.updateTooltip();
    }

    onMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;

            this.saveHistory();

            // Очистка состояния...
            this.currentAxis = null;
            this.sizeStartDimensions = null;
            this.startProjection = null;
            this.rotationPlane = null;
            this.startVector = null;
            this.removeTooltip();

            this.editor.updatePropertiesPanel();
            this.editor.objectsManager.updateSceneStats();
        }
    }

    // ОБРАБОТКА ТРАНСФОРМАЦИЙ
    handleTranslate(mouse) {
        if (!this.currentAxis || !this.startProjection) return;

        const cameraDirection = this.editor.camera.getWorldDirection(new THREE.Vector3());
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(cameraDirection, this.startProjection);

        const currentIntersection = new THREE.Vector3();
        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        if (this.editor.raycaster.ray.intersectPlane(plane, currentIntersection)) {
            const delta = new THREE.Vector3().subVectors(currentIntersection, this.startProjection);
            let finalDelta = delta.clone();

            if (this.snapEnabled) {
                if (this.currentAxis === 'x') {
                    finalDelta.x = Math.round(delta.x / this.moveSnapValue) * this.moveSnapValue;
                } else if (this.currentAxis === 'y') {
                    finalDelta.y = Math.round(delta.y / this.moveSnapValue) * this.moveSnapValue;
                } else if (this.currentAxis === 'z') {
                    finalDelta.z = Math.round(delta.z / this.moveSnapValue) * this.moveSnapValue;
                }
            }

            if (this.currentAxis === 'x') {
                this.attachedObject.position.x = this.startPosition.x + finalDelta.x;
                this.moveDelta.set(finalDelta.x, 0, 0);
            } else if (this.currentAxis === 'y') {
                this.attachedObject.position.y = this.startPosition.y + finalDelta.y;
                this.moveDelta.set(0, finalDelta.y, 0);
            } else if (this.currentAxis === 'z') {
                this.attachedObject.position.z = this.startPosition.z + finalDelta.z;
                this.moveDelta.set(0, 0, finalDelta.z);
            }
        }
    }

    handleSizeChange(mouse) {
        if (!this.currentAxis || !this.sizeStartDimensions || !this.startProjection) return;

        const currentIntersection = this.getPlaneIntersection(mouse);
        if (!currentIntersection) return;

        const delta = new THREE.Vector3().subVectors(currentIntersection, this.startProjection);
        let sizeDeltaAxis = 0;

        if (this.currentAxis === 'x') {
            sizeDeltaAxis = this.snapEnabled ?
                Math.round(delta.x / this.sizeSnapValue) * this.sizeSnapValue :
                delta.x;
            this.sizeDelta.set(sizeDeltaAxis, 0, 0);
        } else if (this.currentAxis === 'y') {
            sizeDeltaAxis = this.snapEnabled ?
                Math.round(delta.y / this.sizeSnapValue) * this.sizeSnapValue :
                delta.y;
            this.sizeDelta.set(0, sizeDeltaAxis, 0);
        } else if (this.currentAxis === 'z') {
            sizeDeltaAxis = this.snapEnabled ?
                Math.round(delta.z / this.sizeSnapValue) * this.sizeSnapValue :
                delta.z;
            this.sizeDelta.set(0, 0, sizeDeltaAxis);
        }

        const newDimensions = new THREE.Vector3(
            Math.max(1, this.sizeStartDimensions.x + this.sizeDelta.x),
            Math.max(1, this.sizeStartDimensions.y + this.sizeDelta.y),
            Math.max(1, this.sizeStartDimensions.z + this.sizeDelta.z)
        );

        this.updateObjectSize(this.attachedObject, newDimensions);
    }

    setupRotation(mouse) {
        // Создаем плоскость вращения, перпендикулярную выбранной оси
        let axisVector = new THREE.Vector3();
        switch(this.currentAxis) {
            case 'x': axisVector.set(1, 0, 0); break;
            case 'y': axisVector.set(0, 1, 0); break;
            case 'z': axisVector.set(0, 0, 1); break;
        }

        // Преобразуем ось в мировые координаты
        axisVector.applyQuaternion(this.gizmoGroup.quaternion);

        this.rotationPlane = new THREE.Plane();
        this.rotationPlane.setFromNormalAndCoplanarPoint(axisVector, this.gizmoGroup.position);

        this.startProjection = this.getPlaneIntersection(mouse);
        if (this.startProjection) {
            this.startVector = new THREE.Vector3().subVectors(
                this.startProjection,
                this.gizmoGroup.position
            ).normalize();
        }
    }

    handleRotate(mouse) {
        if (!this.currentAxis || !this.rotationPlane || !this.startVector) return;

        const currentIntersection = new THREE.Vector3();
        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        if (this.editor.raycaster.ray.intersectPlane(this.rotationPlane, currentIntersection)) {
            const center = this.gizmoGroup.position;
            const currentVector = new THREE.Vector3().subVectors(currentIntersection, center).normalize();

            // Вычисляем угол между векторами
            let axisVector = new THREE.Vector3();
            switch(this.currentAxis) {
                case 'x': axisVector.set(1, 0, 0); break;
                case 'y': axisVector.set(0, 1, 0); break;
                case 'z': axisVector.set(0, 0, 1); break;
            }
            axisVector.applyQuaternion(this.gizmoGroup.quaternion);

            const dot = this.startVector.dot(currentVector);
            const cross = new THREE.Vector3().crossVectors(this.startVector, currentVector);
            const angle = Math.atan2(cross.dot(axisVector), dot);

            let finalAngle = angle;
            if (this.snapEnabled) {
                finalAngle = Math.round(angle / this.rotateSnapValue) * this.rotateSnapValue;
            }

            this.accumulatedAngle += finalAngle;

            // Применяем вращение
            switch(this.currentAxis) {
                case 'x':
                    this.attachedObject.rotation.x = this.startRotation.x + this.accumulatedAngle;
                    break;
                case 'y':
                    this.attachedObject.rotation.y = this.startRotation.y + this.accumulatedAngle;
                    break;
                case 'z':
                    this.attachedObject.rotation.z = this.startRotation.z + this.accumulatedAngle;
                    break;
            }

            // Обновляем начальный вектор для следующего кадра
            this.startVector.copy(currentVector);
        }
    }

    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    getPlaneIntersection(mouse) {
        const cameraDirection = this.editor.camera.getWorldDirection(new THREE.Vector3());
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(cameraDirection, this.gizmoGroup.position);

        const intersection = new THREE.Vector3();
        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        if (this.editor.raycaster.ray.intersectPlane(plane, intersection)) {
            return intersection;
        }
        return null;
    }

    updateObjectSize(object, newDimensions) {
        if (!object.userData.originalSize) {
            object.userData.originalSize = {
                x: object.geometry.parameters?.width || 25,
                y: object.geometry.parameters?.height || 25,
                z: object.geometry.parameters?.depth || 25
            };
            object.userData.originalGeometry = object.geometry.clone();
        }

        const scaleX = newDimensions.x / object.userData.originalSize.x;
        const scaleY = newDimensions.y / object.userData.originalSize.y;
        const scaleZ = newDimensions.z / object.userData.originalSize.z;

        // Сохраняем позицию центра до изменения
        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);

        object.scale.set(scaleX, scaleY, scaleZ);
        object.userData.currentSize = newDimensions;

        // Восстанавливаем позицию центра
        const newBox = new THREE.Box3().setFromObject(object);
        const newCenter = new THREE.Vector3();
        newBox.getCenter(newCenter);

        const offset = new THREE.Vector3().subVectors(center, newCenter);
        object.position.add(offset);
    }

    getObjectDimensions(object) {
        if (!object) return { x: 0, y: 0, z: 0 };

        if (object.userData.currentSize) {
            return {
                x: object.userData.currentSize.x,
                y: object.userData.currentSize.y,
                z: object.userData.currentSize.z
            };
        }

        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);

        return {
            x: size.x,
            y: size.y,
            z: size.z
        };
    }

    updateObjectSizeDirect(object, newDimensions) {


        if (!object.userData.originalSize) {
            const currentDimensions = this.getObjectDimensions(object);
            object.userData.originalSize = {
                x: currentDimensions.x,
                y: currentDimensions.y,
                z: currentDimensions.z
            };
            object.userData.originalScale = {
                x: object.scale.x,
                y: object.scale.y,
                z: object.scale.z
            };
        }

        const scaleX = newDimensions.x / object.userData.originalSize.x;
        const scaleY = newDimensions.y / object.userData.originalSize.y;
        const scaleZ = newDimensions.z / object.userData.originalSize.z;

        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);

        object.scale.set(scaleX, scaleY, scaleZ);
        object.userData.currentSize = newDimensions;

        const newBox = new THREE.Box3().setFromObject(object);
        const newCenter = new THREE.Vector3();
        newBox.getCenter(newCenter);

        const offset = new THREE.Vector3().subVectors(center, newCenter);
        object.position.add(offset);
    }

    saveStartProjection(mouse) {
        if (!this.attachedObject || !this.currentAxis) return;

        const cameraDirection = this.editor.camera.getWorldDirection(new THREE.Vector3());
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(cameraDirection, this.gizmoGroup.position);

        const intersection = new THREE.Vector3();
        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        if (this.editor.raycaster.ray.intersectPlane(plane, intersection)) {
            this.startProjection = intersection;
        }
    }

    updateMousePosition(event, mouse) {
        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.lastMousePosition.copy(mouse);
    }

    // TOOLTIP
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

        let html = '';
        const dimensions = this.getObjectDimensions(this.attachedObject);

        switch(this.transformMode) {
            case 'translate':
                html = `
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
                `;
                break;

            case 'scale':
                html = `
                    <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">Размеры (мм):</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <div style="color: #ff6b6b;">
                            <div style="font-size: 10px; opacity: 0.8;">Ширина (X)</div>
                            <div>${dimensions.x.toFixed(1)}</div>
                        </div>
                        <div style="color: #51cf66;">
                            <div style="font-size: 10px; opacity: 0.8;">Высота (Y)</div>
                            <div>${dimensions.y.toFixed(1)}</div>
                        </div>
                        <div style="color: #339af0;">
                            <div style="font-size: 10px; opacity: 0.8;">Глубина (Z)</div>
                            <div>${dimensions.z.toFixed(1)}</div>
                        </div>
                    </div>
                `;
                break;

            case 'rotate':
                const rotation = this.attachedObject.rotation;
                const degX = THREE.MathUtils.radToDeg(rotation.x).toFixed(1);
                const degY = THREE.MathUtils.radToDeg(rotation.y).toFixed(1);
                const degZ = THREE.MathUtils.radToDeg(rotation.z).toFixed(1);
                html = `
                    <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">Вращение (°):</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <div style="color: #ff6b6b;">
                            <div style="font-size: 10px; opacity: 0.8;">X</div>
                            <div>${degX}</div>
                        </div>
                        <div style="color: #51cf66;">
                            <div style="font-size: 10px; opacity: 0.8;">Y</div>
                            <div>${degY}</div>
                        </div>
                        <div style="color: #339af0;">
                            <div style="font-size: 10px; opacity: 0.8;">Z</div>
                            <div>${degZ}</div>
                        </div>
                    </div>
                `;
                break;
        }

        this.tooltip.innerHTML = html;
        this.tooltip.style.left = (position.x + 20) + 'px';
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

    saveHistory()
    {
        // Сохраняем историю
        if (this.editor.history && this.attachedObject) {
            const actionType = this.transformMode === 'translate' ? 'modify_position' :
                             this.transformMode === 'scale' ? 'modify_size' :
                             'modify_rotation';

            const actionData = {
                type: actionType,
                object: this.attachedObject.uuid,
                data: {}
            };

            switch (actionType) {
                case 'modify_position':
                    actionData.data.position = this.attachedObject.position.toArray();
                    actionData.data.previousPosition = this.startPosition.toArray();
                    break;

                case 'modify_size':
                    actionData.data.dimensions = this.getObjectDimensions(this.attachedObject);
                    actionData.data.previousDimensions = this.sizeStartDimensions;
                    break;

                case 'modify_rotation':
                    actionData.data.rotation = [
                        this.attachedObject.rotation.x,
                        this.attachedObject.rotation.y,
                        this.attachedObject.rotation.z
                    ];
                    actionData.data.previousRotation = [
                        this.startRotation.x,
                        this.startRotation.y,
                        this.startRotation.z
                    ];
                    break;
            }

            this.editor.history.addAction(actionData);
        }
    }

    removeTooltip() {
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }
        this.tooltip = null;
    }

    show() {
        this.gizmoGroup.visible = true;
    }

    hide() {
        this.gizmoGroup.visible = false;
        this.removeTooltip();
    }

    update() {
        if (this.attachedObject && this.gizmoGroup.visible) {
            this.updatePosition();
        }
    }
}