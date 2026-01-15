// gear-generator.js - полностью переработанный
class GearGenerator {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.defaultParams = {
            teeth: 20,
            module: 2,
            pressureAngle: 20,
            faceWidth: 10,
            hubDiameter: 20,
            boreDiameter: 8,
            backlash: 0.1,
            quality: 'medium'
        };
    }

    /**
     * Рассчитывает основные параметры шестерни
     */
    calculateGearParams(params) {
        const teeth = params.teeth;
        const module = params.module;
        const pressureAngle = THREE.MathUtils.degToRad(params.pressureAngle);

        // Основные диаметры шестерни
        const pitchDiameter = teeth * module;
        const addendum = module; // Высота головки зуба
        const dedendum = 1.25 * module; // Высота ножки зуба

        const outerDiameter = pitchDiameter + 2 * addendum;
        const rootDiameter = pitchDiameter - 2 * dedendum;
        const baseDiameter = pitchDiameter * Math.cos(pressureAngle);

        // Угловой шаг между зубьями
        const angularPitch = (2 * Math.PI) / teeth;

        return {
            teeth,
            module,
            pressureAngle,
            pitchDiameter,
            addendum,
            dedendum,
            outerDiameter,
            rootDiameter,
            baseDiameter,
            pitchRadius: pitchDiameter / 2,
            outerRadius: outerDiameter / 2,
            rootRadius: rootDiameter / 2,
            baseRadius: baseDiameter / 2,
            angularPitch,
            fullToothAngle: (2 * Math.PI) / teeth
        };
    }

    /**
     * Создает профиль одного зуба
     */
    createToothProfile(calculated) {
        const points = [];

        // Упрощенный профиль зуба (треугольный)
        // Это даст более четкие зубья чем эвольвента

        // 1. Начало зуба (левая часть)
        points.push(new THREE.Vector2(
            -calculated.angularPitch / 4,
            calculated.rootRadius
        ));

        // 2. Левая наклонная сторона
        points.push(new THREE.Vector2(
            0,
            calculated.outerRadius
        ));

        // 3. Вершина зуба
        points.push(new THREE.Vector2(
            calculated.angularPitch / 8,
            calculated.outerRadius
        ));

        // 4. Правая наклонная сторона
        points.push(new THREE.Vector2(
            calculated.angularPitch / 4,
            calculated.rootRadius
        ));

        // 5. Впадина между зубьями
        points.push(new THREE.Vector2(
            calculated.angularPitch / 2,
            calculated.rootRadius
        ));

        return points;
    }

    /**
     * Создает полный профиль шестерни
     */
    createGearProfile(calculated) {
        // Создаем форму для зубьев
        const shape = new THREE.Shape();

        // Начинаем с первого зуба
        const toothProfile = this.createToothProfile(calculated);

        // Поворачиваем и добавляем все зубья
        for (let i = 0; i < calculated.teeth; i++) {
            const angle = i * calculated.fullToothAngle;

            // Добавляем точки зуба с поворотом
            toothProfile.forEach((point, index) => {
                // Поворачиваем точку на нужный угол
                const x = point.x * Math.cos(angle) - point.y * Math.sin(angle);
                const y = point.x * Math.sin(angle) + point.y * Math.cos(angle);

                if (i === 0 && index === 0) {
                    shape.moveTo(x, y);
                } else {
                    shape.lineTo(x, y);
                }
            });
        }

        // Замыкаем контур
        const firstPoint = toothProfile[0];
        const x = firstPoint.x * Math.cos(0) - firstPoint.y * Math.sin(0);
        const y = firstPoint.x * Math.sin(0) + firstPoint.y * Math.cos(0);
        shape.lineTo(x, y);

        return shape;
    }

    /**
     * Создает 3D модель шестерни с отверстием
     */
    createGear(params = {}) {
        const gearParams = { ...this.defaultParams, ...params };
        const calculated = this.calculateGearParams(gearParams);

        // Создаем основную форму шестерни
        const gearShape = this.createGearProfile(calculated);

        // Добавляем отверстие если нужно
        if (gearParams.boreDiameter > 0) {
            const holePath = new THREE.Path();
            holePath.absarc(0, 0, gearParams.boreDiameter / 2, 0, Math.PI * 2, true);
            gearShape.holes.push(holePath);
        }

        // Настройки экструзии
        const extrudeSettings = {
            depth: gearParams.faceWidth,
            bevelEnabled: false,
            curveSegments: Math.max(32, calculated.teeth * 2)
        };

        // Создаем геометрию зубьев
        const gearGeometry = new THREE.ExtrudeGeometry(gearShape, extrudeSettings);
        gearGeometry.rotateX(-Math.PI / 2);
        gearGeometry.translate(0, gearParams.faceWidth / 2, 0);

        // Создаем материал
        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.3,
            side: THREE.DoubleSide
        });

        // Создаем меш
        const gearMesh = new THREE.Mesh(gearGeometry, material);

        // Если нужна ступица, добавляем ее
        if (gearParams.hubDiameter > gearParams.boreDiameter) {
            this.addHub(gearMesh, gearParams);
        }

        // Настройки отображения
        gearMesh.castShadow = true;
        gearMesh.receiveShadow = true;

        // Пользовательские данные
        gearMesh.userData = {
            type: 'gear',
            gearParams: gearParams,
            name: `Шестерня ${gearParams.teeth}z M${gearParams.module}`,
            createdAt: new Date().toISOString()
        };

        return gearMesh;
    }

    /**
     * Добавляет ступицу к шестерне
     */
    addHub(gearMesh, params) {
        const hubGeometry = new THREE.CylinderGeometry(
            params.hubDiameter / 2,
            params.hubDiameter / 2,
            params.faceWidth,
            32
        );

        const hubMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.8,
            metalness: 0.2
        });

        const hubMesh = new THREE.Mesh(hubGeometry, hubMaterial);
        hubMesh.position.y = params.faceWidth / 2;

        // Если gearMesh - группа, добавляем в нее, иначе создаем группу
        if (gearMesh.isGroup) {
            gearMesh.add(hubMesh);
        } else {
            const group = new THREE.Group();
            group.add(gearMesh);
            group.add(hubMesh);
            gearMesh = group;
        }

        return gearMesh;
    }

    /**
     * Создает упрощенную шестерню (цилиндр с зубьями)
     */
    createSimpleGear(params = {}) {
        const gearParams = { ...this.defaultParams, ...params };
        const calculated = this.calculateGearParams(gearParams);

        // Создаем форму для зубчатого профиля
        const shape = new THREE.Shape();

        // Количество сегментов для аппроксимации окружности
        const segments = gearParams.teeth * 8;

        // Создаем зубчатый профиль
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;

            // Определяем положение точки на профиле
            let radius;
            const toothAngle = angle % calculated.fullToothAngle;
            const toothProgress = toothAngle / calculated.fullToothAngle;

            if (toothProgress < 0.25) {
                // Подъем к вершине
                radius = calculated.rootRadius +
                    (calculated.outerRadius - calculated.rootRadius) *
                    (toothProgress / 0.25);
            } else if (toothProgress < 0.5) {
                // Спуск от вершины
                radius = calculated.outerRadius -
                    (calculated.outerRadius - calculated.rootRadius) *
                    ((toothProgress - 0.25) / 0.25);
            } else {
                // Впадина
                radius = calculated.rootRadius;
            }

            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }

        // Добавляем отверстие если нужно
        if (gearParams.boreDiameter > 0) {
            const holePath = new THREE.Path();
            holePath.absarc(0, 0, gearParams.boreDiameter / 2, 0, Math.PI * 2, true);
            shape.holes.push(holePath);
        }

        // Настройки экструзии
        const extrudeSettings = {
            depth: gearParams.faceWidth,
            bevelEnabled: false,
            curveSegments: Math.max(32, gearParams.teeth * 2)
        };

        // Создаем геометрию
        const gearGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        gearGeometry.rotateX(-Math.PI / 2);
        gearGeometry.translate(0, gearParams.faceWidth / 2, 0);

        // Создаем материал
        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.3
        });

        const gearMesh = new THREE.Mesh(gearGeometry, material);

        // Если нужна ступица, добавляем ее
        if (gearParams.hubDiameter > gearParams.boreDiameter) {
            this.addHub(gearMesh, gearParams);
        }

        gearMesh.castShadow = true;
        gearMesh.receiveShadow = true;

        gearMesh.userData = {
            type: 'gear',
            gearParams: gearParams,
            name: `Шестерня ${gearParams.teeth}z M${gearParams.module} (упрощ.)`,
            createdAt: new Date().toISOString(),
            simplified: true
        };

        return gearMesh;
    }

    /**
     * Создает тестовую шестерню (быстрая и простая)
     */
    createTestGear(params = {}) {
        const gearParams = { ...this.defaultParams, ...params };

        // Создаем простую зубчатую шестерню через CylinderGeometry с модификацией
        const segments = gearParams.teeth * 8; // Увеличиваем сегменты для зубьев

        // Создаем цилиндр
        const geometry = new THREE.CylinderGeometry(
            gearParams.module * gearParams.teeth / 2 + gearParams.module, // Внешний радиус
            gearParams.module * gearParams.teeth / 2 + gearParams.module,
            gearParams.faceWidth,
            segments
        );

        // Модифицируем вершины для создания зубьев
        const positionAttribute = geometry.attributes.position;

        for (let i = 0; i < positionAttribute.count; i++) {
            const x = positionAttribute.getX(i);
            const z = positionAttribute.getZ(i);

            // Рассчитываем угол и расстояние от центра
            const angle = Math.atan2(z, x);
            const distance = Math.sqrt(x * x + z * z);

            // Пропускаем верхние и нижние грани
            if (Math.abs(positionAttribute.getY(i)) < gearParams.faceWidth / 2 - 0.1) {
                // Создаем зубчатый профиль
                const toothAngle = (angle + Math.PI) % (2 * Math.PI / gearParams.teeth);
                const toothFactor = Math.abs(Math.sin(toothAngle * gearParams.teeth * 2));

                // Внешний радиус с зубьями
                const baseRadius = gearParams.module * gearParams.teeth / 2;
                const newRadius = baseRadius + gearParams.module * (0.5 + 0.5 * toothFactor);

                // Обновляем позицию
                const ratio = newRadius / distance;
                positionAttribute.setX(i, x * ratio);
                positionAttribute.setZ(i, z * ratio);
            }
        }

        geometry.computeVertexNormals();
        geometry.rotateX(Math.PI / 2);

        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.3
        });

        const gearMesh = new THREE.Mesh(geometry, material);

        // Добавляем отверстие если нужно
        if (gearParams.boreDiameter > 0) {
            const boreGeometry = new THREE.CylinderGeometry(
                gearParams.boreDiameter / 2,
                gearParams.boreDiameter / 2,
                gearParams.faceWidth + 2,
                32
            );
            boreGeometry.rotateX(Math.PI / 2);

            const boreMaterial = new THREE.MeshStandardMaterial({
                color: 0x606060,
                roughness: 0.8
            });

            const bore = new THREE.Mesh(boreGeometry, boreMaterial);
            gearMesh.add(bore);
        }

        gearMesh.castShadow = true;
        gearMesh.receiveShadow = true;

        gearMesh.userData = {
            type: 'gear',
            gearParams: gearParams,
            name: `Тестовая шестерня ${gearParams.teeth}z`,
            createdAt: new Date().toISOString(),
            test: true
        };

        return gearMesh;
    }

    /**
     * Показывает UI для создания шестерни
     */
    showGearUI() {
        if (document.getElementById('gearModal')) {
            return;
        }

        const modalHTML = `
            <div class="modal-overlay active" id="gearModal">
                <div class="modal-content" style="width: 500px;">
                    <div class="modal-header">
                        <h4><i class="fas fa-cog"></i> Генератор шестерён</h4>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Количество зубьев:</label>
                            <input type="number" id="gearTeeth" min="6" max="200" value="20" class="modal-input">
                        </div>
                        <div class="form-group">
                            <label>Модуль (мм):</label>
                            <input type="number" id="gearModule" min="0.5" max="20" step="0.1" value="2" class="modal-input">
                        </div>
                        <div class="form-group">
                            <label>Ширина зуба (мм):</label>
                            <input type="number" id="gearFaceWidth" min="1" max="100" value="10" class="modal-input">
                        </div>
                        <div class="form-group">
                            <label>Диаметр ступицы (мм):</label>
                            <input type="number" id="gearHubDiameter" min="5" max="200" value="20" class="modal-input">
                        </div>
                        <div class="form-group">
                            <label>Диаметр отверстия (мм):</label>
                            <input type="number" id="gearBoreDiameter" min="0" max="100" value="8" class="modal-input">
                        </div>

                        <div class="form-group">
                            <label>Тип шестерни:</label>
                            <select id="gearType" class="modal-select">
                                <option value="simple">Упрощенная (рекомендуется)</option>
                                <option value="test">Тестовая (быстрая)</option>
                            </select>
                        </div>

                        <div class="info-box">
                            <strong>Расчетные параметры:</strong>
                            <div id="gearCalculations" style="margin-top: 5px; color: #aaa; font-size: 12px;">
                                Диаметр: 40мм, Высота зуба: 2.5мм
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelGear">Отмена</button>
                        <button class="btn btn-primary" id="createGear">Создать</button>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);

        // Обновляем расчетные параметры
        this.updateCalculations();

        // Обработчики событий
        const closeModal = () => {
            if (modalContainer && modalContainer.parentNode) {
                modalContainer.parentNode.removeChild(modalContainer);
            }
        };

        document.querySelector('#gearModal .close-modal').addEventListener('click', closeModal);
        document.getElementById('cancelGear').addEventListener('click', closeModal);

        document.getElementById('createGear').addEventListener('click', () => {
            this.createGearFromUI();
            closeModal();
        });

        // Обновление расчетов при изменении параметров
        document.querySelectorAll('#gearModal .modal-input').forEach(input => {
            input.addEventListener('input', () => {
                this.updateCalculations();
            });
        });
    }

    /**
     * Обновляет расчетные параметры в UI
     */
    updateCalculations() {
        try {
            const teeth = parseInt(document.getElementById('gearTeeth').value) || 20;
            const module = parseFloat(document.getElementById('gearModule').value) || 2;

            const pitchDiameter = teeth * module;
            const addendum = module;
            const dedendum = 1.25 * module;
            const outerDiameter = pitchDiameter + 2 * addendum;
            const rootDiameter = pitchDiameter - 2 * dedendum;

            const calculations = document.getElementById('gearCalculations');
            if (calculations) {
                calculations.innerHTML = `
                    <div>Диаметр вершин: ${outerDiameter.toFixed(2)}мм</div>
                    <div>Делительный диаметр: ${pitchDiameter.toFixed(2)}мм</div>
                    <div>Диаметр впадин: ${rootDiameter.toFixed(2)}мм</div>
                    <div>Высота зуба: ${(addendum + dedendum).toFixed(2)}мм</div>
                `;
            }
        } catch (e) {
            console.warn('Не удалось обновить расчеты:', e);
        }
    }

    /**
     * Создает шестерню из параметров UI
     */
    createGearFromUI() {
        try {
            const params = {
                teeth: parseInt(document.getElementById('gearTeeth').value) || 20,
                module: parseFloat(document.getElementById('gearModule').value) || 2,
                faceWidth: parseFloat(document.getElementById('gearFaceWidth').value) || 10,
                hubDiameter: parseFloat(document.getElementById('gearHubDiameter').value) || 20,
                boreDiameter: parseFloat(document.getElementById('gearBoreDiameter').value) || 8
            };

            const gearType = document.getElementById('gearType').value;

            // Проверка параметров
            if (params.teeth < 6) {
                this.editor.showStatus('Количество зубьев должно быть не менее 6', 'error');
                return;
            }

            if (params.module <= 0) {
                this.editor.showStatus('Модуль должен быть положительным числом', 'error');
                return;
            }

            if (params.boreDiameter >= params.hubDiameter && params.hubDiameter > 0) {
                this.editor.showStatus('Диаметр отверстия должен быть меньше диаметра ступицы', 'warning');
            }

            let gear;
            switch (gearType) {
                case 'simple':
                    gear = this.createSimpleGear(params);
                    break;
                case 'test':
                    gear = this.createTestGear(params);
                    break;
                default:
                    gear = this.createSimpleGear(params);
            }

            if (!gear) {
                this.editor.showStatus('Не удалось создать шестерню', 'error');
                return;
            }

            // Добавляем в сцену
            this.editor.objectsGroup.add(gear);
            this.editor.objects.push(gear);

            // Выделяем новую шестерню
            this.editor.selectObject(gear);

            // Добавляем в историю
            this.editor.history.addAction({
                type: 'create',
                object: gear.uuid,
                data: this.editor.projectManager.serializeObjectForHistory(gear)
            });

            // Обновляем статистику
            this.editor.objectsManager.updateSceneStats();
            this.editor.objectsManager.updateSceneList();

            this.editor.showStatus(`Шестерня создана: ${params.teeth} зубьев, модуль ${params.module}мм`, 'success');

        } catch (error) {
            console.error('Ошибка создания шестерни:', error);
            this.editor.showStatus(`Ошибка создания шестерни: ${error.message}`, 'error');
        }
    }
}