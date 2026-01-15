/**
 * Инструмент "Размеры" для отображения размеров элементов
 */
class DimensionSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'dimension', 'fa-ruler-combined');
        this.selectedElement = null;
        this.tempDimensionGroup = null;
    }

    onMouseDown(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return false;

        // Получаем элемент под курсором
        const element = this.sketchManager.elementManager.getElementAtPoint(point);

        if (element) {
            this.showElementDimensions(element);
            return true;
        } else {
            // Если кликнули мимо элемента, скрываем размеры
            this.clearTempDimensions();
            this.selectedElement = null;
            return true;
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.clearTempDimensions();
            this.selectedElement = null;
            return true;
        } else if (e.key === 'd' || e.key === 'в') {
            if (this.selectedElement && this.tempDimensionGroup) {
                this.makeDimensionsPersistent();
                return true;
            }
        } else if (e.key === 'Delete') {
            this.deleteSelectedDimensions();
            return true;
        }
        return false;
    }

    onCancel() {
        this.clearTempDimensions();
        this.selectedElement = null;
    }

    showElementDimensions(element) {
        if (!element || !element.mesh) return;

        // Очищаем предыдущие временные размеры
        this.clearTempDimensions();

        this.selectedElement = element;

        // Создаем группу для размерных линий
        this.tempDimensionGroup = new THREE.Group();
        this.tempDimensionGroup.name = 'temp_dimension_group';
        this.tempDimensionGroup.userData = {
            type: 'dimension_group',
            isTemporary: true,
            elementId: element.mesh.uuid
        };

        // В зависимости от типа элемента показываем разные размеры
        switch(element.type) {
            case 'line':
                this.createLineDimension(element);
                break;
            case 'rectangle':
                this.createRectangleDimension(element);
                break;
            case 'circle':
                this.createCircleDimension(element);
                break;
            case 'oval':
                this.createOvalDimension(element);
                break;
            case 'polygon':
                this.createPolygonDimension(element);
                break;
            case 'arc':
                this.createArcDimension(element);
                break;
            default:
                this.sketchManager.editor.showStatus('Размеры для данного типа элемента не поддерживаются', 'warning');
                return;
        }

        // Добавляем группу на плоскость
        if (this.tempDimensionGroup.children.length > 0) {
            this.sketchManager.currentPlane.add(this.tempDimensionGroup);
        }

        this.sketchManager.editor.showStatus(`Показаны размеры элемента. Нажмите D чтобы сохранить, Esc чтобы отменить.`, 'info');
    }

    createLineDimension(element) {
        if (!element.mesh || !element.mesh.geometry) return;

        const positionAttr = element.mesh.geometry.attributes.position;
        if (!positionAttr || positionAttr.count < 2) return;

        const start = new THREE.Vector3(positionAttr.getX(0), positionAttr.getY(0), 0);
        const end = new THREE.Vector3(positionAttr.getX(1), positionAttr.getY(1), 0);

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return;

        const direction = new THREE.Vector3(dx, dy, 0).normalize();
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
        const offsetDist = 8;

        const lineStart = new THREE.Vector3(
            start.x + perpendicular.x * offsetDist,
            start.y + perpendicular.y * offsetDist,
            0.2
        );
        const lineEnd = new THREE.Vector3(
            end.x + perpendicular.x * offsetDist,
            end.y + perpendicular.y * offsetDist,
            0.2
        );

        // Основная размерная линия
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd]);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x3498db,
            linewidth: 2
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);

        // Выносные линии
        const extLine1 = this.createLine(
            [new THREE.Vector3(start.x, start.y, 0.2), lineStart],
            { color: 0x3498db, linewidth: 1 }
        );

        const extLine2 = this.createLine(
            [new THREE.Vector3(end.x, end.y, 0.2), lineEnd],
            { color: 0x3498db, linewidth: 1 }
        );

        // Текст
        const textPos = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(
                -perpendicular.y * 5,
                perpendicular.x * 5,
                0.2
            ));

        const textSprite = this.createTextSprite(textPos, `${length.toFixed(1)} мм`, 12);

        [line, extLine1, extLine2, textSprite].forEach(obj => {
            obj.userData.dimensionType = 'line';
            this.tempDimensionGroup.add(obj);
        });
    }

    createRectangleDimension(element) {
        if (!element.mesh || !element.mesh.geometry) return;

        const positionAttr = element.mesh.geometry.attributes.position;
        if (!positionAttr || positionAttr.count < 4) return;

        // Получаем точки прямоугольника
        const points = [];
        for (let i = 0; i < Math.min(positionAttr.count, 5); i++) {
            points.push(new THREE.Vector3(
                positionAttr.getX(i),
                positionAttr.getY(i),
                0
            ));
        }

        if (points.length < 3) return;

        // Находим min/max
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        const width = maxX - minX;
        const height = maxY - minY;

        // Размер ширины
        const widthOffset = 12;
        const widthLine = this.createLine(
            [
                new THREE.Vector3(minX, minY - widthOffset, 0.2),
                new THREE.Vector3(maxX, minY - widthOffset, 0.2)
            ],
            { color: 0x3498db, linewidth: 2 }
        );

        const widthExt1 = this.createLine(
            [
                new THREE.Vector3(minX, minY, 0.2),
                new THREE.Vector3(minX, minY - widthOffset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const widthExt2 = this.createLine(
            [
                new THREE.Vector3(maxX, minY, 0.2),
                new THREE.Vector3(maxX, minY - widthOffset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const widthTextPos = new THREE.Vector3(minX + width / 2, minY - widthOffset - 4, 0.2);
        const widthText = this.createTextSprite(widthTextPos, `${width.toFixed(1)} мм`, 12);

        // Размер высоты
        const heightOffset = 12;
        const heightLine = this.createLine(
            [
                new THREE.Vector3(maxX + heightOffset, minY, 0.2),
                new THREE.Vector3(maxX + heightOffset, maxY, 0.2)
            ],
            { color: 0x3498db, linewidth: 2 }
        );

        const heightExt1 = this.createLine(
            [
                new THREE.Vector3(maxX, minY, 0.2),
                new THREE.Vector3(maxX + heightOffset, minY, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const heightExt2 = this.createLine(
            [
                new THREE.Vector3(maxX, maxY, 0.2),
                new THREE.Vector3(maxX + heightOffset, maxY, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const heightTextPos = new THREE.Vector3(maxX + heightOffset + 4, minY + height / 2, 0.2);
        const heightText = this.createTextSprite(heightTextPos, `${height.toFixed(1)} мм`, 12);

        [widthLine, widthExt1, widthExt2, widthText, heightLine, heightExt1, heightExt2, heightText].forEach(obj => {
            obj.userData.dimensionType = 'rectangle';
            this.tempDimensionGroup.add(obj);
        });
    }

    createCircleDimension(element) {
        if (!element.mesh) return;

        // Получаем параметры из userData или вычисляем
        let center, radius;

        if (element.mesh.userData.centerLocal) {
            center = element.mesh.userData.centerLocal;
            radius = element.mesh.userData.radius || 5;
        } else {
            // Вычисляем из геометрии
            const positionAttr = element.mesh.geometry.attributes.position;
            if (!positionAttr) return;

            let sumX = 0, sumY = 0;
            const count = positionAttr.count;

            for (let i = 0; i < count; i++) {
                sumX += positionAttr.getX(i);
                sumY += positionAttr.getY(i);
            }

            center = new THREE.Vector3(sumX / count, sumY / count, 0);

            let totalDistance = 0;
            for (let i = 0; i < count; i++) {
                const point = new THREE.Vector3(
                    positionAttr.getX(i),
                    positionAttr.getY(i),
                    0
                );
                totalDistance += point.distanceTo(center);
            }

            radius = totalDistance / count;
        }

        if (radius <= 0) return;

        const diameter = radius * 2;
        const offset = 8;

        // Линия диаметра
        const diamLine = this.createLine(
            [
                new THREE.Vector3(center.x - radius, center.y - offset, 0.2),
                new THREE.Vector3(center.x + radius, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 2 }
        );

        const extLine1 = this.createLine(
            [
                new THREE.Vector3(center.x - radius, center.y, 0.2),
                new THREE.Vector3(center.x - radius, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const extLine2 = this.createLine(
            [
                new THREE.Vector3(center.x + radius, center.y, 0.2),
                new THREE.Vector3(center.x + radius, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const textPos = new THREE.Vector3(center.x, center.y - offset - 4, 0.2);
        const textSprite = this.createTextSprite(textPos, `Ø${diameter.toFixed(1)}`, 12);

        [diamLine, extLine1, extLine2, textSprite].forEach(obj => {
            obj.userData.dimensionType = 'circle';
            this.tempDimensionGroup.add(obj);
        });
    }

    createOvalDimension(element) {
        if (!element.mesh) return;

        let center, width, height;

        if (element.mesh.userData.centerLocal && element.mesh.userData.width && element.mesh.userData.height) {
            center = element.mesh.userData.centerLocal;
            width = element.mesh.userData.width;
            height = element.mesh.userData.height;
        } else {
            const positionAttr = element.mesh.geometry.attributes.position;
            if (!positionAttr) return;

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            for (let i = 0; i < positionAttr.count; i++) {
                const x = positionAttr.getX(i);
                const y = positionAttr.getY(i);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }

            center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);
            width = maxX - minX;
            height = maxY - minY;
        }

        if (width <= 0 || height <= 0) return;

        const offset = 8;

        // Размер ширины
        const xLine = this.createLine(
            [
                new THREE.Vector3(center.x - width/2, center.y - offset, 0.2),
                new THREE.Vector3(center.x + width/2, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 2 }
        );

        const xExt1 = this.createLine(
            [
                new THREE.Vector3(center.x - width/2, center.y, 0.2),
                new THREE.Vector3(center.x - width/2, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const xExt2 = this.createLine(
            [
                new THREE.Vector3(center.x + width/2, center.y, 0.2),
                new THREE.Vector3(center.x + width/2, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const xTextPos = new THREE.Vector3(center.x, center.y - offset - 4, 0.2);
        const xText = this.createTextSprite(xTextPos, `${width.toFixed(1)} мм`, 12);

        // Размер высоты
        const yLine = this.createLine(
            [
                new THREE.Vector3(center.x + offset, center.y - height/2, 0.2),
                new THREE.Vector3(center.x + offset, center.y + height/2, 0.2)
            ],
            { color: 0x3498db, linewidth: 2 }
        );

        const yExt1 = this.createLine(
            [
                new THREE.Vector3(center.x, center.y - height/2, 0.2),
                new THREE.Vector3(center.x + offset, center.y - height/2, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const yExt2 = this.createLine(
            [
                new THREE.Vector3(center.x, center.y + height/2, 0.2),
                new THREE.Vector3(center.x + offset, center.y + height/2, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const yTextPos = new THREE.Vector3(center.x + offset + 4, center.y, 0.2);
        const yText = this.createTextSprite(yTextPos, `${height.toFixed(1)} мм`, 12);

        [xLine, xExt1, xExt2, xText, yLine, yExt1, yExt2, yText].forEach(obj => {
            obj.userData.dimensionType = 'oval';
            this.tempDimensionGroup.add(obj);
        });
    }

    createPolygonDimension(element) {
        if (!element.mesh) return;

        let center, radius;

        if (element.mesh.userData.centerLocal && element.mesh.userData.radius) {
            center = element.mesh.userData.centerLocal;
            radius = element.mesh.userData.radius;
        } else {
            const positionAttr = element.mesh.geometry.attributes.position;
            if (!positionAttr) return;

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            for (let i = 0; i < positionAttr.count; i++) {
                const x = positionAttr.getX(i);
                const y = positionAttr.getY(i);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }

            center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);

            // Находим максимальное расстояние от центра до вершин
            radius = 0;
            for (let i = 0; i < positionAttr.count; i++) {
                const point = new THREE.Vector3(
                    positionAttr.getX(i),
                    positionAttr.getY(i),
                    0
                );
                radius = Math.max(radius, point.distanceTo(center));
            }
        }

        if (radius <= 0) return;

        const diameter = radius * 2;
        const offset = 8;

        // Линия диаметра
        const diamLine = this.createLine(
            [
                new THREE.Vector3(center.x - radius, center.y - offset, 0.2),
                new THREE.Vector3(center.x + radius, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 2 }
        );

        const extLine1 = this.createLine(
            [
                new THREE.Vector3(center.x - radius, center.y, 0.2),
                new THREE.Vector3(center.x - radius, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const extLine2 = this.createLine(
            [
                new THREE.Vector3(center.x + radius, center.y, 0.2),
                new THREE.Vector3(center.x + radius, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 1 }
        );

        const sides = element.mesh.userData.sides || 6;
        const textPos = new THREE.Vector3(center.x, center.y - offset - 4, 0.2);
        const textSprite = this.createTextSprite(textPos, `Ø${diameter.toFixed(1)} (${sides} уг.)`, 12);

        [diamLine, extLine1, extLine2, textSprite].forEach(obj => {
            obj.userData.dimensionType = 'polygon';
            this.tempDimensionGroup.add(obj);
        });
    }

    createArcDimension(element) {
        if (!element.mesh) return;

        const center = element.mesh.userData.centerLocal || new THREE.Vector3(0, 0, 0);
        const radius = element.mesh.userData.radius || 5;

        if (radius <= 0) return;

        const offset = 8;

        // Линия радиуса
        const radiusLine = this.createLine(
            [
                new THREE.Vector3(center.x, center.y - offset, 0.2),
                new THREE.Vector3(center.x + radius, center.y - offset, 0.2)
            ],
            { color: 0x3498db, linewidth: 2 }
        );

        const textPos = new THREE.Vector3(
            center.x + radius / 2,
            center.y - offset - 4,
            0.2
        );
        const textSprite = this.createTextSprite(textPos, `R${radius.toFixed(1)}`, 12);

        [radiusLine, textSprite].forEach(obj => {
            obj.userData.dimensionType = 'arc';
            this.tempDimensionGroup.add(obj);
        });
    }

    createLine(points, options = {}) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: options.color || 0x3498db,
            linewidth: options.linewidth || 1
        });

        const line = new THREE.Line(geometry, material);
        line.userData.isDimension = true;
        line.userData.isTemporary = true;

        return line;
    }

    createTextSprite(position, text, fontSize = 12) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = `bold ${fontSize}px Arial`;
        context.fillStyle = '#3498db';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });

        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        sprite.scale.set(20, 5, 1);
        sprite.userData.isDimension = true;
        sprite.userData.isTemporary = true;

        return sprite;
    }

    clearTempDimensions() {
        if (this.tempDimensionGroup && this.tempDimensionGroup.parent) {
            this.tempDimensionGroup.parent.remove(this.tempDimensionGroup);

            // Очищаем ресурсы
            this.tempDimensionGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
                if (child.map) child.map.dispose();
            });
        }

        this.tempDimensionGroup = null;
    }

    makeDimensionsPersistent() {
        if (!this.tempDimensionGroup || this.tempDimensionGroup.children.length === 0) {
            this.sketchManager.editor.showStatus('Нет размеров для сохранения', 'warning');
            return;
        }

        // Создаем постоянную группу
        const persistentGroup = this.tempDimensionGroup.clone();
        persistentGroup.name = 'dimension_group_' + Date.now();
        persistentGroup.userData.isTemporary = false;
        persistentGroup.userData.type = 'sketch_element';
        persistentGroup.userData.elementType = 'dimension';
        persistentGroup.userData.createdAt = new Date().toISOString();
        persistentGroup.userData.dimensionForElement = this.selectedElement?.mesh?.uuid;

        // Добавляем как элемент скетча
        this.sketchManager.currentPlane.add(persistentGroup);

        const dimensionElement = {
            type: 'dimension',
            mesh: persistentGroup,
            color: 0x3498db,
            userData: persistentGroup.userData
        };

        this.sketchManager.elementManager.elements.push(dimensionElement);

        this.sketchManager.editor.showStatus('Размеры сохранены как элемент', 'success');

        // Очищаем временную группу
        this.clearTempDimensions();
        this.selectedElement = null;
    }

    deleteSelectedDimensions() {
        // Находим все элементы размеров
        const dimensionElements = this.sketchManager.elementManager.elements.filter(el =>
            el.type === 'dimension' || (el.mesh && el.mesh.userData.elementType === 'dimension')
        );

        if (dimensionElements.length === 0) {
            this.sketchManager.editor.showStatus('Нет сохраненных размеров', 'warning');
            return;
        }

        if (!confirm(`Удалить все сохраненные размеры (${dimensionElements.length} элементов)?`)) {
            return;
        }

        // Удаляем все элементы размеров
        dimensionElements.forEach(element => {
            if (element.mesh && element.mesh.parent) {
                element.mesh.parent.remove(element.mesh);

                element.mesh.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                    if (child.map) child.map.dispose();
                });
            }

            const index = this.sketchManager.elementManager.elements.indexOf(element);
            if (index > -1) {
                this.sketchManager.elementManager.elements.splice(index, 1);
            }
        });

        this.sketchManager.editor.showStatus(`Удалено размеров: ${dimensionElements.length}`, 'success');
    }
}