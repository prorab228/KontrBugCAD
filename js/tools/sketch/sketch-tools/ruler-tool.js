/**
 * Инструмент "Линейка" для измерения расстояний
 */
class RulerSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'ruler', 'fa-ruler');
        this.measurements = [];
        this.currentMeasurement = null;

        this.dimensionFields = [
            { label: 'Длина', type: 'number', value: 0, unit: 'мм', min: 0, step: 0.1 }
        ];
    }

    onMouseDown(e) {
        if (this.sketchManager.isInputActive) {
            this.sketchManager.applyDimensionInput();
            return true;
        }

        const point = this.getPointOnPlane(e);
        if (!point) return false;

        if (!this.currentMeasurement) {
            // Начало нового измерения - первая точка
            this.currentMeasurement = {
                id: 'measure_' + Date.now(),
                start: point.clone(),
                end: point.clone(),
                length: 0,
                line: null,
                dimension: null,
                color: 0x3498db,
                stage: 1 // Стадия: первая точка установлена
            };

            this.sketchManager.editor.showStatus('Установлена первая точка. Установите вторую точку.', 'info');
            return true;
        } else if (this.currentMeasurement.stage === 1) {
            // Установка второй точки
            this.currentMeasurement.end = point.clone();
            this.currentMeasurement.length = this.currentMeasurement.start.distanceTo(point);
            this.currentMeasurement.stage = 2; // Измерение завершено

            // Создаем линию измерения
            this.createMeasurementLine();
            this.updateMeasurementDimension();

            this.finalizeMeasurement();
            return true;
        }

        return false;
    }

    onMouseMove(e) {
        if (!this.currentMeasurement || this.currentMeasurement.stage !== 1) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        // Обновляем предварительное положение второй точки
        this.currentMeasurement.end = point.clone();
        this.currentMeasurement.length = this.currentMeasurement.start.distanceTo(point);

        // Создаем или обновляем предварительную линию
        if (!this.currentMeasurement.line) {
            this.createMeasurementLine();
        } else {
            this.updateMeasurementLine();
        }

        // Обновляем предварительный размер
        this.updateMeasurementDimension();

        if (this.sketchManager.isInputActive) {
            this.updateInputFields();
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            if (this.currentMeasurement) {
                this.clearCurrentMeasurement();
                this.sketchManager.editor.showStatus('Измерение отменено', 'info');
            } else {
                this.clearAllMeasurements();
            }
            return true;
        } else if (e.key === 'Enter' && this.currentMeasurement && this.currentMeasurement.stage === 1) {
            // Завершить измерение по Enter (фиксирует текущую позицию курсора)
            this.currentMeasurement.stage = 2;
            this.createMeasurementLine();
            this.updateMeasurementDimension();
            this.finalizeMeasurement();
            return true;
        } else if (e.key === 'Delete') {
            this.clearAllMeasurements();
            return true;
        }
        return false;
    }

    onCancel() {
        this.clearCurrentMeasurement();
        this.sketchManager.dimensionManager.clearDimensionObjects();
    }

    onDeactivate() {
        this.clearAllMeasurements();
    }

    createMeasurementLine() {
        if (!this.currentMeasurement || !this.sketchManager.currentPlane) return;

        // Удаляем старую линию, если есть
        if (this.currentMeasurement.line) {
            this.sketchManager.currentPlane.remove(this.currentMeasurement.line);
            this.currentMeasurement.line.geometry.dispose();
            this.currentMeasurement.line.material.dispose();
        }

        const start = this.currentMeasurement.start;
        const end = this.currentMeasurement.end;

        // Создаем линию измерения только если есть расстояние
        if (start.distanceTo(end) > 0) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                this.sketchManager.currentPlane.worldToLocal(start.clone()),
                this.sketchManager.currentPlane.worldToLocal(end.clone())
            ]);

            const material = new THREE.LineDashedMaterial({
                color: this.currentMeasurement.color,
                linewidth: 2,
                dashSize: 2,
                gapSize: 1,
                scale: 1
            });

            this.currentMeasurement.line = new THREE.Line(geometry, material);
            this.currentMeasurement.line.userData = {
                isMeasurement: true,
                measurementId: this.currentMeasurement.id
            };

            this.sketchManager.currentPlane.add(this.currentMeasurement.line);
            this.currentMeasurement.line.computeLineDistances();
        }
    }

    updateMeasurementLine() {
        if (!this.currentMeasurement || !this.currentMeasurement.line) return;

        const geometry = new THREE.BufferGeometry().setFromPoints([
            this.sketchManager.currentPlane.worldToLocal(this.currentMeasurement.start.clone()),
            this.sketchManager.currentPlane.worldToLocal(this.currentMeasurement.end.clone())
        ]);

        this.currentMeasurement.line.geometry.dispose();
        this.currentMeasurement.line.geometry = geometry;
        this.currentMeasurement.line.computeLineDistances();
    }

    updateMeasurementDimension() {
        if (!this.currentMeasurement || this.currentMeasurement.length <= 0) return;

        // Удаляем старые размерные объекты
        if (this.currentMeasurement.dimension) {
            this.currentMeasurement.dimension.forEach(obj => {
                if (obj.parent) obj.parent.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
        }

        this.currentMeasurement.dimension = [];

        // Создаем размерную линию и текст с меньшими отступами
        const start = this.currentMeasurement.start;
        const end = this.currentMeasurement.end;

        if (!this.sketchManager.currentPlane) return;

        const localStart = this.sketchManager.currentPlane.worldToLocal(start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(end.clone());

        const dx = localEnd.x - localStart.x;
        const dy = localEnd.y - localStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const direction = new THREE.Vector3(dx, dy, 0).normalize();
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
        const offsetDist = 8; // Уменьшили отступ

        const lineStart = new THREE.Vector3(
            localStart.x + perpendicular.x * offsetDist,
            localStart.y + perpendicular.y * offsetDist,
            0.2
        );
        const lineEnd = new THREE.Vector3(
            localEnd.x + perpendicular.x * offsetDist,
            localEnd.y + perpendicular.y * offsetDist,
            0.2
        );

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd]);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: this.currentMeasurement.color,
            linewidth: 2
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);

        const extLine1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localStart.x, localStart.y, 0.2),
                lineStart
            ]),
            new THREE.LineBasicMaterial({ color: this.currentMeasurement.color, linewidth: 1 })
        );

        const extLine2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localEnd.x, localEnd.y, 0.2),
                lineEnd
            ]),
            new THREE.LineBasicMaterial({ color: this.currentMeasurement.color, linewidth: 1 })
        );

        const textPos = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(
                -perpendicular.y * 4,
                perpendicular.x * 4,
                0.2
            ));

        // Создаем текст с меньшим размером
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 12px Arial';
        context.fillStyle = '#3498db';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`${length.toFixed(1)} мм`, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });

        const textSprite = new THREE.Sprite(spriteMaterial);
        textSprite.position.copy(textPos);
        textSprite.scale.set(18, 4, 1); // Уменьшили размер

        [line, extLine1, extLine2, textSprite].forEach(obj => {
            obj.userData = {
                isMeasurement: true,
                measurementId: this.currentMeasurement.id
            };
            this.sketchManager.currentPlane.add(obj);
            this.currentMeasurement.dimension.push(obj);
        });
    }

    finalizeMeasurement() {
        if (!this.currentMeasurement || this.currentMeasurement.length <= 0) {
            this.clearCurrentMeasurement();
            return;
        }

        // Добавляем измерение в список
        this.measurements.push({
            ...this.currentMeasurement,
            finalized: true
        });

        // Показываем поле ввода для точного значения
        const config = this.getDimensionConfig();
        config.fields[0].value = this.currentMeasurement.length.toFixed(1);

        // Показываем подсказку
        this.sketchManager.editor.showStatus(
            `Измерение: ${this.currentMeasurement.length.toFixed(1)} мм. Нажмите Esc для удаления, Enter для нового измерения.`,
            'info'
        );

        // Начинаем новое измерение
        this.currentMeasurement = null;
    }

    clearCurrentMeasurement() {
        if (this.currentMeasurement) {
            if (this.currentMeasurement.line) {
                this.sketchManager.currentPlane.remove(this.currentMeasurement.line);
                this.currentMeasurement.line.geometry.dispose();
                this.currentMeasurement.line.material.dispose();
            }

            if (this.currentMeasurement.dimension) {
                this.currentMeasurement.dimension.forEach(obj => {
                    if (obj.parent) obj.parent.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                    if (obj.map) obj.map.dispose();
                });
            }

            this.currentMeasurement = null;
        }
    }

    clearAllMeasurements() {
        this.clearCurrentMeasurement();

        // Удаляем все завершенные измерения
        this.measurements.forEach(measurement => {
            if (measurement.line && measurement.line.parent) {
                measurement.line.parent.remove(measurement.line);
                measurement.line.geometry.dispose();
                measurement.line.material.dispose();
            }

            if (measurement.dimension) {
                measurement.dimension.forEach(obj => {
                    if (obj.parent) obj.parent.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                    if (obj.map) obj.map.dispose();
                });
            }
        });

        this.measurements = [];
        this.sketchManager.editor.showStatus('Все измерения удалены', 'info');
    }

    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.currentMeasurement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.currentMeasurement.length.toFixed(1);
        }
    }

    applyDimensions(values) {
        if (!this.currentMeasurement) return;

        if (values.value1 && values.value1 > 0) {
            this.currentMeasurement.length = values.value1;

            // Обновляем конечную точку с учетом заданной длины
            const direction = new THREE.Vector3().subVectors(
                this.currentMeasurement.end,
                this.currentMeasurement.start
            ).normalize();

            if (direction.length() === 0) {
                direction.set(1, 0, 0);
            }

            this.currentMeasurement.end = this.currentMeasurement.start.clone().add(
                direction.multiplyScalar(values.value1)
            );

            this.updateMeasurementLine();
            this.updateMeasurementDimension();
        }

        this.finalizeMeasurement();
    }
}