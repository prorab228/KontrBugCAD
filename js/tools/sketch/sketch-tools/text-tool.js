/**
 * Упрощенный инструмент "Текст" с правильным порядком событий
 */
class TextSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'text', 'fa-font');
        this.fontSize = 20;
        this.currentText = 'Текст';

        // Состояние инструмента
        this.isWaitingForInput = false;
        this.clickPosition = null;

        // Временный элемент для предпросмотра
        this.previewElement = null;

        // Конфигурация полей ввода
        this.dimensionFields = [
            {
                label: 'Текст',
                type: 'text',
                value: this.currentText,
                unit: '',
                placeholder: 'Введите текст'
            },
            {
                label: 'Размер',
                type: 'number',
                value: this.fontSize,
                unit: 'мм',
                min: 5,
                max: 100,
                step: 1
            }
        ];
    }

    onMouseDown(e) {
        // Если активно поле ввода, пропускаем обработку
        if (this.sketchManager.isInputActive) {
            return false;
        }

        // Получаем позицию клика
        const point = this.getPointOnPlane(e);
        if (!point) {
            console.warn('Не удалось определить позицию на плоскости');
            return false;
        }

        console.log('Текстовый инструмент: клик в позиции', point);

        // Сохраняем позицию клика
        this.clickPosition = point.clone();
        this.isWaitingForInput = true;

        // Создаем временный маркер позиции
        this.createPositionMarker(point);

        // Показываем поле ввода через небольшой таймаут, чтобы избежать конфликтов
        setTimeout(() => {
            const config = this.getDimensionConfig();
            console.log('Показываем поле ввода с конфигом:', config);
            this.sketchManager.dimensionManager.showDimensionInput(e, config);
        }, 10);

        return true;
    }

    applyDimensions(values) {
        console.log('applyDimensions вызван с значениями:', values);

        if (!this.clickPosition) {
            console.error('Нет позиции для текста');
            this.onCancel();
            return;
        }

        // Получаем значения из параметров
        const textValue = values.value1 || this.currentText;
        const sizeValue = parseFloat(values.value2) || this.fontSize;

        if (!textValue.trim()) {
            console.warn('Текст не может быть пустым');
            this.onCancel();
            return;
        }

        // Создаем элемент текста
        const textElement = {
            type: 'text',
            position: this.clickPosition.clone(),
            content: textValue,
            fontSize: Math.max(5, Math.min(100, sizeValue)),
            color: this.sketchManager.sketchColor,
            contours: this.generateSimpleTextContours(textValue, this.clickPosition, sizeValue)
        };

        console.log('Создан текстовый элемент через applyDimensions:', textElement);

        // Добавляем элемент
        this.sketchManager.elementManager.addElement(textElement);

        // Сбрасываем состояние
        this.onCancel();
    }

    getDimensionConfig() {
        return {
            fields: this.dimensionFields,
            // Можно добавить callback, если нужно
            callback: (values) => {
                console.log('Callback вызван с значениями:', values);
                this.applyDimensions(values);
            }
        };
    }

    createPositionMarker(position) {
        this.clearTempGeometry();

        // Создаем простой крест для маркера позиции
        const size = 5;
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            position.x - size, position.y, 0.1,
            position.x + size, position.y, 0.1,
            position.x, position.y - size, 0.1,
            position.x, position.y + size, 0.1
        ]);

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0xFFFF00,
            linewidth: 2
        });

        const lines = new THREE.LineSegments(geometry, material);

        // Преобразуем в локальные координаты плоскости
        const localPos = this.sketchManager.currentPlane.worldToLocal(position.clone());
        lines.position.set(localPos.x, localPos.y, 0.1);

        this.tempGeometry = lines;
        this.sketchManager.currentPlane.add(lines);

        console.log('Маркер позиции создан в', position);
    }

    onMouseMove(e) {
        // Если ждем ввода и поле ввода не активно, обновляем позицию маркера
        if (this.isWaitingForInput && !this.sketchManager.isInputActive && this.clickPosition) {
            const point = this.getPointOnPlane(e);
            if (point) {
                this.clickPosition.copy(point);
                this.updatePositionMarker(point);
            }
        }
    }

    updatePositionMarker(position) {
        if (!this.tempGeometry) return;

        const size = 5;
        const vertices = new Float32Array([
            position.x - size, position.y, 0.1,
            position.x + size, position.y, 0.1,
            position.x, position.y - size, 0.1,
            position.x, position.y + size, 0.1
        ]);

        this.tempGeometry.geometry.setAttribute('position',
            new THREE.BufferAttribute(vertices, 3));
        this.tempGeometry.geometry.attributes.position.needsUpdate = true;

        // Обновляем позицию в локальных координатах
        const localPos = this.sketchManager.currentPlane.worldToLocal(position.clone());
        this.tempGeometry.position.set(localPos.x, localPos.y, 0.1);
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.onCancel();
            return true;
        }

        return false;
    }

    applyDimensionInput() {
        console.log('Применение ввода текста');

        if (!this.clickPosition) {
            console.error('Нет позиции для текста');
            this.onCancel();
            return;
        }

        // Получаем значения из полей ввода
        const textValue = this.sketchManager.inputField1?.value || this.currentText;
        const sizeValue = parseFloat(this.sketchManager.inputField2?.value) || this.fontSize;

        if (!textValue.trim()) {
            console.warn('Текст не может быть пустым');
            this.onCancel();
            return;
        }

        // Создаем элемент текста
        const textElement = {
            type: 'text',
            position: this.clickPosition.clone(),
            content: textValue,
            fontSize: Math.max(5, Math.min(100, sizeValue)),
            color: this.sketchManager.sketchColor,
            contours: this.generateSimpleTextContours(textValue, this.clickPosition, sizeValue)
        };

        console.log('Создан текстовый элемент:', textElement);

        // Добавляем элемент
        this.sketchManager.elementManager.addElement(textElement);

        // Сбрасываем состояние
        this.onCancel();
    }

    generateSimpleTextContours(text, position, fontSize) {
        if (!text || !this.sketchManager.currentPlane) {
            console.warn('Невозможно сгенерировать контуры: нет текста или плоскости');
            return [];
        }

        const contours = [];
        const scale = fontSize / 100;
        const charWidth = fontSize * 0.6;
        const charHeight = fontSize;
        const spacing = fontSize * 0.1;

        // Простые прямоугольные контуры для каждого символа
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const x = position.x + i * (charWidth + spacing);
            const y = position.y;

            // Прямоугольник для символа (упрощенный контур)
            const charPoints = [
                new THREE.Vector3(x, y, 0),
                new THREE.Vector3(x + charWidth, y, 0),
                new THREE.Vector3(x + charWidth, y + charHeight, 0),
                new THREE.Vector3(x, y + charHeight, 0),
                new THREE.Vector3(x, y, 0) // Замыкаем контур
            ];

            // Преобразуем в мировые координаты
            const worldPoints = charPoints.map(p =>
                this.sketchManager.currentPlane.localToWorld(p)
            );

            contours.push(worldPoints);
        }

        console.log(`Сгенерировано ${contours.length} контуров для текста "${text}"`);
        return contours;
    }

    handleInputChange(fieldNum, value) {
        console.log(`Изменение поля ${fieldNum}:`, value);

        if (!this.clickPosition) return;

        if (fieldNum === 1) {
            // Изменение текста - обновляем предпросмотр
            this.currentText = value || '';
            this.updatePreview();
        } else if (fieldNum === 2) {
            // Изменение размера
            const fontSize = parseFloat(value) || this.fontSize;
            this.fontSize = Math.max(5, Math.min(100, fontSize));
            this.updatePreview();
        }
    }

    updatePreview() {
        // Очищаем старый предпросмотр
        if (this.previewElement && this.previewElement.parent) {
            this.previewElement.parent.remove(this.previewElement);
            if (this.previewElement.geometry) this.previewElement.geometry.dispose();
            if (this.previewElement.material) this.previewElement.material.dispose();
        }

        // Создаем новый предпросмотр
        if (this.currentText && this.clickPosition) {
            const contours = this.generateSimpleTextContours(
                this.currentText,
                this.clickPosition,
                this.fontSize
            );

            const previewGroup = new THREE.Group();

            contours.forEach((contour, index) => {
                if (contour.length < 3) return;

                const vertices = [];
                contour.forEach(point => {
                    const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
                    vertices.push(localPoint.x, localPoint.y, 0.1);
                });

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position',
                    new THREE.Float32BufferAttribute(vertices, 3));

                const material = new THREE.LineBasicMaterial({
                    color: 0xFFFF00,
                    linewidth: 2,
                    transparent: true,
                    opacity: 0.7
                });

                const line = new THREE.LineLoop(geometry, material);
                previewGroup.add(line);
            });

            this.previewElement = previewGroup;
            this.sketchManager.currentPlane.add(previewGroup);
        }
    }

    onCancel() {
        console.log('Отмена создания текста');

        // Очищаем временные элементы
        this.clearTempGeometry();

        if (this.previewElement && this.previewElement.parent) {
            this.previewElement.parent.remove(this.previewElement);
            if (this.previewElement.geometry) this.previewElement.geometry.dispose();
            if (this.previewElement.material) this.previewElement.material.dispose();
            this.previewElement = null;
        }

        // Сбрасываем состояние
        this.clickPosition = null;
        this.isWaitingForInput = false;
        this.sketchManager.dimensionManager.hideDimensionInput();
    }

    onDeactivate() {
        this.onCancel();
    }
}