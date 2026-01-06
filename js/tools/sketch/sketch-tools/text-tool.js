/**
 * Инструмент "Текст" (исправленный для контуров)
 */
class TextSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'text', 'fa-font');
        this.fontSize = 20;
        this.currentText = 'Text';

        this.dimensionFields = [
            { label: 'Текст', type: 'text', value: this.currentText, unit: '', placeholder: 'Введите текст' },
            { label: 'Размер шрифта', type: 'number', value: this.fontSize, unit: 'px', min: 5, max: 100, step: 1 }
        ];
    }

    onMouseDown(e) {
        if (this.sketchManager.isInputActive) {
            this.sketchManager.applyDimensionInput();
            return true;
        }

        const point = this.getPointOnPlane(e);
        if (!point) return false;

        this.tempElement = {
            type: 'text',
            position: point.clone(),
            content: this.currentText,
            fontSize: this.fontSize,
            color: this.sketchManager.sketchColor,
            contours: [] // Здесь будут контуры для каждого символа
        };

        // Создаем предварительный просмотр контуров
        this.updateTextPreview();

        // Показываем поле ввода
        const config = this.getDimensionConfig();
        this.sketchManager.showDimensionInput(e, config);

        return true;
    }

    // Удаляем createTextPreview и заменяем на updateTextPreview
    updateTextPreview() {
        this.clearTempGeometry();

        if (!this.tempElement || !this.tempElement.content) return;

        // Рассчитываем контуры для предпросмотра
        this.tempElement.contours = this.calculateTextContours();

        // Создаем геометрию для предпросмотра
        this.createPreviewGeometry();
    }

    createPreviewGeometry() {
        if (!this.tempElement || !this.tempElement.contours) return;

        // Создаем группу для всех контуров
        const textGroup = new THREE.Group();

        this.tempElement.contours.forEach((contour, index) => {
            const vertices = [];

            contour.forEach(point => {
                const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
                vertices.push(localPoint.x, localPoint.y, 0);
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

            const mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                color: this.tempElement.color,
                linewidth: 2,
                transparent: true,
                opacity: 0.7
            }));

            textGroup.add(mesh);
        });

        this.tempGeometry = textGroup;
        this.sketchManager.currentPlane.add(textGroup);
    }

    calculateTextContours() {
        if (!this.sketchManager.currentPlane || !this.tempElement || !this.tempElement.content) {
            return [];
        }

        const localPos = this.sketchManager.currentPlane.worldToLocal(this.tempElement.position.clone());
        const contours = [];

        // Параметры символов
        const charWidth = this.tempElement.fontSize * 0.6;
        const charHeight = this.tempElement.fontSize;
        const spacing = this.tempElement.fontSize * 0.1;

        // Для каждого символа создаем прямоугольный контур
        for (let i = 0; i < this.tempElement.content.length; i++) {
            const char = this.tempElement.content[i];
            const x = localPos.x + i * (charWidth + spacing);
            const y = localPos.y;

            // Прямоугольник символа
            const charPoints = [
                new THREE.Vector3(x, y, 0),
                new THREE.Vector3(x + charWidth, y, 0),
                new THREE.Vector3(x + charWidth, y + charHeight, 0),
                new THREE.Vector3(x, y + charHeight, 0),
                new THREE.Vector3(x, y, 0) // Замыкаем контур
            ];

            // Преобразуем в мировые координаты
            const worldPoints = charPoints.map(p => this.sketchManager.currentPlane.localToWorld(p));
            contours.push(worldPoints);
        }

        return contours;
    }

    onMouseMove(e) {
        // Для текста мы не обновляем позицию при перемещении мыши
        // Позиция устанавливается при клике и больше не меняется
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.onCancel();
            return true;
        } else if (e.key === 'Enter' && this.sketchManager.isInputActive) {
            // При нажатии Enter применяем введенные значения
            this.applyDimensions({
                value1: this.sketchManager.inputField1?.value || '',
                value2: parseFloat(this.sketchManager.inputField2?.value) || this.fontSize
            });
            return true;
        }
        return false;
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        // Обновляем текст и размер шрифта
        if (values.value1 !== undefined) {
            this.tempElement.content = values.value1;
        }
        if (values.value2 && values.value2 > 0) {
            this.tempElement.fontSize = values.value2;
        }

        // Обновляем предпросмотр с новыми параметрами
        this.updateTextPreview();

        // Добавляем финальный элемент
        this.sketchManager.addElement(this.tempElement);

        // Очищаем временные данные
        this.clearTempGeometry();
        this.tempElement = null;

        // Скрываем поле ввода
        this.sketchManager.hideDimensionInput();
    }

    onCancel() {
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.hideDimensionInput();
    }

    // Метод для обработки изменений в полях ввода в реальном времени
    handleInputChange(fieldNum, value) {
        if (!this.tempElement) return;

        if (fieldNum === 1) {
            // Изменение текста
            this.tempElement.content = value;
            this.updateTextPreview();
        } else if (fieldNum === 2) {
            // Изменение размера шрифта
            const fontSize = parseFloat(value) || this.fontSize;
            this.tempElement.fontSize = Math.max(5, Math.min(100, fontSize));
            this.updateTextPreview();
        }
    }
}