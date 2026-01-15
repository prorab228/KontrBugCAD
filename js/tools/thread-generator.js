// js/thread-generator.js
class ThreadGenerator {
    constructor(cadEditor) {
        this.editor = cadEditor;

        // Стандартные параметры резьб
        this.threadStandards = {
            metric: {
                name: 'Метрическая',
                standards: {
                    'M3': { diameter: 3, pitch: 0.5, minorDiameter: 2.459, threadAngle: 60 },
                    'M4': { diameter: 4, pitch: 0.7, minorDiameter: 3.242, threadAngle: 60 },
                    'M5': { diameter: 5, pitch: 0.8, minorDiameter: 4.134, threadAngle: 60 },
                    'M6': { diameter: 6, pitch: 1.0, minorDiameter: 4.917, threadAngle: 60 },
                    'M8': { diameter: 8, pitch: 1.25, minorDiameter: 6.647, threadAngle: 60 },
                    'M10': { diameter: 10, pitch: 1.5, minorDiameter: 8.376, threadAngle: 60 },
                    'M12': { diameter: 12, pitch: 1.75, minorDiameter: 10.106, threadAngle: 60 },
                    'M14': { diameter: 14, pitch: 2.0, minorDiameter: 11.835, threadAngle: 60 },
                    'M16': { diameter: 16, pitch: 2.0, minorDiameter: 13.835, threadAngle: 60 },
                    'M20': { diameter: 20, pitch: 2.5, minorDiameter: 17.294, threadAngle: 60 },
                    'M24': { diameter: 24, pitch: 3.0, minorDiameter: 20.752, threadAngle: 60 }
                }
            },
            inch: {
                name: 'Дюймовая (UNC)',
                standards: {
                    '1/4-20': { diameter: 6.35, pitch: 1.27, minorDiameter: 5.08, threadAngle: 60 },
                    '5/16-18': { diameter: 7.94, pitch: 1.41, minorDiameter: 6.48, threadAngle: 60 },
                    '3/8-16': { diameter: 9.53, pitch: 1.59, minorDiameter: 7.94, threadAngle: 60 },
                    '1/2-13': { diameter: 12.7, pitch: 1.95, minorDiameter: 10.92, threadAngle: 60 },
                    '3/4-10': { diameter: 19.05, pitch: 2.54, minorDiameter: 16.41, threadAngle: 60 },
                    '1-8': { diameter: 25.4, pitch: 3.18, minorDiameter: 22.23, threadAngle: 60 }
                }
            },
            trapezoidal: {
                name: 'Трапецеидальная',
                standards: {
                    'Tr8x1.5': { diameter: 8, pitch: 1.5, minorDiameter: 6.2, threadAngle: 30 },
                    'Tr10x2': { diameter: 10, pitch: 2.0, minorDiameter: 7.5, threadAngle: 30 },
                    'Tr12x3': { diameter: 12, pitch: 3.0, minorDiameter: 8.5, threadAngle: 30 },
                    'Tr16x4': { diameter: 16, pitch: 4.0, minorDiameter: 11.5, threadAngle: 30 },
                    'Tr20x4': { diameter: 20, pitch: 4.0, minorDiameter: 15.5, threadAngle: 30 },
                    'Tr24x5': { diameter: 24, pitch: 5.0, minorDiameter: 18.5, threadAngle: 30 }
                }
            },
            pipe: {
                name: 'Трубная (BSP)',
                standards: {
                    'G1/8': { diameter: 9.73, pitch: 0.907, minorDiameter: 8.85, threadAngle: 55 },
                    'G1/4': { diameter: 13.16, pitch: 1.337, minorDiameter: 11.89, threadAngle: 55 },
                    'G3/8': { diameter: 16.66, pitch: 1.337, minorDiameter: 15.39, threadAngle: 55 },
                    'G1/2': { diameter: 20.96, pitch: 1.814, minorDiameter: 19.17, threadAngle: 55 },
                    'G3/4': { diameter: 26.44, pitch: 1.814, minorDiameter: 24.65, threadAngle: 55 },
                    'G1': { diameter: 33.25, pitch: 2.309, minorDiameter: 30.92, threadAngle: 55 }
                }
            },
            custom: {
                name: 'Произвольная',
                standards: {}
            }
        };

        // Параметры по умолчанию
        this.defaultParams = {
            type: 'metric',
            standard: 'M10',
            diameter: 10,
            pitch: 1.5,
            minorDiameter: 8.376,
            threadAngle: 60,
            length: 30,
            direction: 'right',
            threadType: 'external', // 'external' или 'internal'
            chamfer: true,
            chamferAngle: 45,
            segmentsPerTurn: 32,
            quality: 'medium' // 'low', 'medium', 'high'
        };
    }

    /**
     * Генерирует профиль резьбы (улучшенная версия)
     */
    generateThreadProfile(params) {
        const profile = [];
        const angleRad = THREE.MathUtils.degToRad(params.threadAngle / 2);

        // Высота профиля
        const h = (params.diameter - params.minorDiameter) / 2;
        const halfPitch = params.pitch / 2;

        // Для метрической и дюймовой резьбы
        if (params.type === 'metric' || params.type === 'inch') {
            // Более точный профиль метрической резьбы
            const flatWidth = params.pitch * 0.125; // Ширина плоской части (стандарт ISO)

            // Начало профиля (нижняя точка)
            profile.push(new THREE.Vector2(-halfPitch, -h/2));

            // Наклонная сторона
            const slopeLength = halfPitch - flatWidth;
            profile.push(new THREE.Vector2(-flatWidth, -h/2 + slopeLength * Math.tan(angleRad)));

            // Верхняя плоская часть
            profile.push(new THREE.Vector2(flatWidth, h/2));

            // Вторая наклонная
            profile.push(new THREE.Vector2(halfPitch - flatWidth, -h/2 + slopeLength * Math.tan(angleRad)));

            // Конец профиля
            profile.push(new THREE.Vector2(halfPitch, -h/2));
        }
        // Для трапецеидальной резьбы
        else if (params.type === 'trapezoidal') {
            const flatTop = params.pitch * 0.25;
            const flatBottom = params.pitch * 0.25;
            const slopeHeight = params.pitch * 0.25 * Math.tan(THREE.MathUtils.degToRad(15));

            profile.push(new THREE.Vector2(-halfPitch, -h/2));
            profile.push(new THREE.Vector2(-halfPitch + flatBottom, -h/2));
            profile.push(new THREE.Vector2(-flatTop/2, h/2 - slopeHeight));
            profile.push(new THREE.Vector2(-flatTop/2, h/2));
            profile.push(new THREE.Vector2(flatTop/2, h/2));
            profile.push(new THREE.Vector2(flatTop/2, h/2 - slopeHeight));
            profile.push(new THREE.Vector2(halfPitch - flatBottom, -h/2));
            profile.push(new THREE.Vector2(halfPitch, -h/2));
        }
        // Для трубной резьбы (закругленная)
        else if (params.type === 'pipe') {
            const radius = h * 0.25;
            const segments = 12;

            // Нижняя плоская часть
            profile.push(new THREE.Vector2(-halfPitch, -h/2));
            profile.push(new THREE.Vector2(-halfPitch + radius, -h/2));

            // Закругление
            for (let i = 1; i < segments; i++) {
                const t = i / (segments - 1);
                const angle = Math.PI * t;
                const x = radius * Math.cos(angle);
                const y = h/2 - radius + radius * Math.sin(angle);
                profile.push(new THREE.Vector2(x, y));
            }

            // Верхняя плоская часть
            profile.push(new THREE.Vector2(halfPitch - radius, -h/2));
            profile.push(new THREE.Vector2(halfPitch, -h/2));
        }
        // Произвольная резьба
        else {
            // Простой треугольный профиль
            profile.push(new THREE.Vector2(-halfPitch, -h/2));
            profile.push(new THREE.Vector2(0, h/2));
            profile.push(new THREE.Vector2(halfPitch, -h/2));
        }

        return { points: profile, height: h };
    }

    /**
     * Создает 3D модель резьбы (исправленная)
     */
    createThread(params = {}) {
        // Объединяем параметры
        const threadParams = { ...this.defaultParams, ...params };

        // Определяем качество
        const qualitySettings = {
            low: { segmentsPerTurn: 16, radialSegments: 8 },
            medium: { segmentsPerTurn: 32, radialSegments: 16 },
            high: { segmentsPerTurn: 64, radialSegments: 32 }
        };

        const quality = qualitySettings[threadParams.quality] || qualitySettings.medium;

        // Генерируем профиль
        const profileData = this.generateThreadProfile(threadParams);
        const profilePoints = profileData.points;
        const profileHeight = profileData.height;

        // Количество витков
        const turns = Math.ceil(threadParams.length / threadParams.pitch);

        // Радиусы для резьбы
        const majorRadius = threadParams.diameter / 2;
        const minorRadius = threadParams.minorDiameter / 2;

        // Для наружной резьбы профиль направлен наружу, для внутренней - внутрь
        const baseRadius = threadParams.threadType === 'external' ? minorRadius : majorRadius;
        const profileOffset = threadParams.threadType === 'external' ? majorRadius - minorRadius : 0;

        // Создаем геометрию
        const vertices = [];
        const indices = [];
        const normals = [];
        const uvs = [];

        const profileLength = profilePoints.length;
        const totalSegments = turns * quality.segmentsPerTurn;

        // Создаем вершинный массив
        for (let i = 0; i <= totalSegments; i++) {
            const t = i / totalSegments;
            const angle = t * turns * Math.PI * 2;
            const height = t * threadParams.length;

            // Направление резьбы
            const direction = threadParams.direction === 'right' ? 1 : -1;

            for (let j = 0; j < profileLength; j++) {
                const profilePoint = profilePoints[j];

                // Позиция точки в локальной системе координат профиля
                const localX = profilePoint.x;
                const localY = profilePoint.y;

                // Радиус в данной точке профиля
                const radius = baseRadius + (profilePoint.y + profileHeight/2) * (profileOffset / profileHeight);

                // Преобразование в мировые координаты
                const x = Math.cos(angle * direction) * radius;
                const y = height + localX; // Ось Y - это ось резьбы
                const z = Math.sin(angle * direction) * radius;

                vertices.push(x, y, z);

                // Нормаль
                const normal = new THREE.Vector3(
                    Math.cos(angle * direction) * (profilePoint.y > 0 ? 1 : -1),
                    0,
                    Math.sin(angle * direction) * (profilePoint.y > 0 ? 1 : -1)
                ).normalize();
                normals.push(normal.x, normal.y, normal.z);

                // UV координаты
                uvs.push(i / totalSegments, j / (profileLength - 1));
            }
        }

        // Создаем индексы для треугольников
        for (let i = 0; i < totalSegments; i++) {
            for (let j = 0; j < profileLength - 1; j++) {
                const a = i * profileLength + j;
                const b = i * profileLength + (j + 1);
                const c = (i + 1) * profileLength + j;
                const d = (i + 1) * profileLength + (j + 1);

                // Первый треугольник
                indices.push(a, b, d);
                // Второй треугольник
                indices.push(a, d, c);
            }
        }

        // Создаем геометрию
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);

        // Оптимизируем геометрию
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // Создаем материал резьбы
        const material = new THREE.MeshStandardMaterial({
            color: threadParams.threadType === 'external' ? 0xC0C0C0 : 0x808080,
            roughness: 0.5,
            metalness: threadParams.threadType === 'external' ? 0.6 : 0.3,
            side: THREE.DoubleSide,
            flatShading: false
        });

        // Создаем меш резьбы
        const threadMesh = new THREE.Mesh(geometry, material);
        threadMesh.castShadow = true;
        threadMesh.receiveShadow = true;

        // Создаем группу для всей резьбы
        const threadGroup = new THREE.Group();
        threadGroup.add(threadMesh);

        // Добавляем фаску если нужно
        if (threadParams.chamfer) {
            this.addChamfer(threadGroup, threadParams);
        }

        // Добавляем цилиндр основы
        this.addBaseCylinder(threadGroup, threadParams);

        // Позиционируем группу
        threadGroup.position.y = threadParams.length / 2;

        // Пользовательские данные
        threadGroup.userData = {
            type: 'thread',
            threadType: threadParams.threadType,
            threadParams: threadParams,
            name: `${threadParams.threadType === 'external' ? 'Наружная' : 'Внутренняя'} резьба ${threadParams.standard || threadParams.diameter + 'мм'}`,
            createdAt: new Date().toISOString()
        };

        return threadGroup;
    }

    /**
     * Добавляет фаску на концах резьбы (исправленная)
     */
    addChamfer(parentGroup, params) {
        if (!params.chamfer) return;

        const chamferHeight = params.pitch * 1.5;
        const chamferAngle = THREE.MathUtils.degToRad(params.chamferAngle);
        const chamferWidth = chamferHeight * Math.tan(chamferAngle);

        const majorRadius = params.diameter / 2;
        const minorRadius = params.minorDiameter / 2;

        // Создаем геометрию фаски
        let topRadius, bottomRadius;

        if (params.threadType === 'external') {
            // Для наружной резьбы фаска сужается к концу
            topRadius = majorRadius;
            bottomRadius = Math.max(majorRadius - chamferWidth, minorRadius);
        } else {
            // Для внутренней резьбы фаска расширяется внутрь
            topRadius = minorRadius;
            bottomRadius = Math.min(minorRadius + chamferWidth, majorRadius);
        }

        const chamferGeometry = new THREE.CylinderGeometry(
            topRadius,
            bottomRadius,
            chamferHeight,
            32
        );

        const chamferMaterial = new THREE.MeshStandardMaterial({
            color: params.threadType === 'external' ? 0xC0C0C0 : 0x808080,
            roughness: 0.5,
            metalness: params.threadType === 'external' ? 0.6 : 0.3
        });

        // Верхняя фаска
        const topChamfer = new THREE.Mesh(chamferGeometry, chamferMaterial);
        topChamfer.position.y = params.length + chamferHeight / 2;

        // Для наружной резьбы разворачиваем фаску
        if (params.threadType === 'external') {
            topChamfer.rotation.x = Math.PI;
        }

        // Нижняя фаска
        const bottomChamfer = new THREE.Mesh(chamferGeometry, chamferMaterial);
        bottomChamfer.position.y = -chamferHeight / 2;

        // Для внутренней резьбы нижняя фаска не нужна или должна быть другой
        if (params.threadType === 'external') {
            parentGroup.add(topChamfer);
            parentGroup.add(bottomChamfer);
        } else {
            // Для внутренней резьбы добавляем только верхнюю фаску
            parentGroup.add(topChamfer);
        }
    }

    /**
     * Добавляет цилиндрическую основу для резьбы (исправленная)
     */
    addBaseCylinder(parentGroup, params) {
        const majorRadius = params.diameter / 2;
        const minorRadius = params.minorDiameter / 2;

        // Учитываем фаску при расчете высоты
        const chamferHeight = params.chamfer ? params.pitch * 1.5 : 0;
        const cylinderHeight = params.length + chamferHeight * 2;

        if (params.threadType === 'external') {
            // Цилиндр для наружной резьбы (стержень)
            const cylinderGeometry = new THREE.CylinderGeometry(
                minorRadius,
                minorRadius,
                cylinderHeight,
                32
            );

            const cylinderMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 0.8,
                metalness: 0.2
            });

            const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
            cylinder.position.y = params.length / 2;
            parentGroup.add(cylinder);
        } else {
            // Труба для внутренней резьбы (отверстие с фаской)
            // Внешний цилиндр (тело детали)
            const outerCylinderGeometry = new THREE.CylinderGeometry(
                majorRadius * 1.2,
                majorRadius * 1.2,
                cylinderHeight,
                32
            );

            const outerCylinderMaterial = new THREE.MeshStandardMaterial({
                color: 0xA0A0A0,
                roughness: 0.8,
                metalness: 0.2
            });

            const outerCylinder = new THREE.Mesh(outerCylinderGeometry, outerCylinderMaterial);
            outerCylinder.position.y = params.length / 2;
            parentGroup.add(outerCylinder);

            // Внутренний цилиндр (отверстие)
            const innerCylinderGeometry = new THREE.CylinderGeometry(
                majorRadius,
                majorRadius,
                params.length + chamferHeight * 2,
                32
            );

            const innerCylinderMaterial = new THREE.MeshStandardMaterial({
                color: 0x606060,
                roughness: 0.8,
                metalness: 0.1,
                side: THREE.BackSide
            });

            const innerCylinder = new THREE.Mesh(innerCylinderGeometry, innerCylinderMaterial);
            innerCylinder.position.y = params.length / 2;
            parentGroup.add(innerCylinder);
        }
    }

    /**
     * Показывает UI для создания резьбы
     */
    showThreadUI() {
        // Создаем модальное окно
        const modalHTML = `
            <div class="modal-overlay active" id="threadModal">
                <div class="modal-content" style="width: 550px;">
                    <div class="modal-header">
                        <h4><i class="fas fa-screwdriver"></i> Генератор резьбы</h4>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>Тип резьбы:</label>
                                <select id="threadType" class="modal-select">
                                    <option value="metric">Метрическая</option>
                                    <option value="inch">Дюймовая (UNC)</option>
                                    <option value="trapezoidal">Трапецеидальная</option>
                                    <option value="pipe">Трубная (BSP)</option>
                                    <option value="custom">Произвольная</option>
                                </select>
                            </div>

                            <div class="form-group" style="flex: 1;">
                                <label>Стандарт:</label>
                                <select id="threadStandard" class="modal-select">
                                    <!-- Заполнится динамически -->
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>Тип:</label>
                                <select id="threadDirectionType" class="modal-select">
                                    <option value="external">Наружная</option>
                                    <option value="internal">Внутренняя</option>
                                </select>
                            </div>

                            <div class="form-group" style="flex: 1;">
                                <label>Направление:</label>
                                <select id="threadDirection" class="modal-select">
                                    <option value="right">Правая</option>
                                    <option value="left">Левая</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>Диаметр (мм):</label>
                                <input type="number" id="threadDiameter" min="1" max="100" step="0.1" value="10" class="modal-input">
                            </div>

                            <div class="form-group" style="flex: 1;">
                                <label>Шаг (мм):</label>
                                <input type="number" id="threadPitch" min="0.1" max="10" step="0.1" value="1.5" class="modal-input">
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>Длина (мм):</label>
                                <input type="number" id="threadLength" min="1" max="200" value="30" class="modal-input">
                            </div>

                            <div class="form-group" style="flex: 1;">
                                <label>Угол профиля (°):</label>
                                <input type="number" id="threadAngle" min="10" max="80" value="60" class="modal-input">
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>Качество:</label>
                                <select id="threadQuality" class="modal-select">
                                    <option value="low">Низкое</option>
                                    <option value="medium" selected>Среднее</option>
                                    <option value="high">Высокое</option>
                                </select>
                            </div>

                            <div class="form-group" style="flex: 1;">
                                <label style="display: flex; align-items: center;">
                                    <input type="checkbox" id="threadChamfer" checked style="margin-right: 8px;">
                                    Фаска на концах
                                </label>
                            </div>
                        </div>

                        <div class="form-group">
                            <div id="threadPreview" style="height: 200px; background: #2a2a2a; border-radius: 5px; margin: 10px 0; display: flex; align-items: center; justify-content: center; color: #888;">
                                <i class="fas fa-screwdriver fa-3x"></i>
                            </div>
                        </div>

                        <div class="info-box" style="background: #2a2a2a; padding: 10px; border-radius: 5px; margin-top: 10px; font-size: 12px;">
                            <strong>Справка:</strong>
                            <ul style="margin: 5px 0; padding-left: 20px;">
                                <li>Метрическая: ISO, DIN, ГОСТ</li>
                                <li>Дюймовая: UNC (Unified National Coarse)</li>
                                <li>Трапецеидальная: Tr, для ходовых винтов</li>
                                <li>Трубная: BSP (British Standard Pipe)</li>
                            </ul>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelThread">Отмена</button>
                        <button class="btn btn-primary" id="createThread">Создать</button>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модальное окно в DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);

        // Заполняем стандарты
        this.populateThreadStandards();

        // Обработчики событий
        document.querySelector('#threadModal .close-modal').addEventListener('click', () => {
            document.querySelector('#threadModal').remove();
        });

        document.getElementById('cancelThread').addEventListener('click', () => {
            document.querySelector('#threadModal').remove();
        });

        document.getElementById('createThread').addEventListener('click', () => {
            this.createThreadFromUI();
        });

        // Обработчики изменений
        document.getElementById('threadType').addEventListener('change', () => {
            this.populateThreadStandards();
            this.updateThreadParamsFromStandard();
        });

        document.getElementById('threadStandard').addEventListener('change', () => {
            this.updateThreadParamsFromStandard();
        });

        document.getElementById('threadDirectionType').addEventListener('change', () => {
            this.updateThreadPreview();
        });

        // Обновление превью при изменении параметров
        document.querySelectorAll('#threadModal .modal-input, #threadModal .modal-select').forEach(input => {
            input.addEventListener('change', () => {
                this.updateThreadPreview();
            });
        });

        // Инициализация превью
        this.updateThreadPreview();
    }

    /**
     * Заполняет список стандартов
     */
    populateThreadStandards() {
        const threadType = document.getElementById('threadType').value;
        const standardSelect = document.getElementById('threadStandard');

        // Очищаем список
        standardSelect.innerHTML = '';

        // Добавляем стандарты для выбранного типа
        const standards = this.threadStandards[threadType].standards;

        if (threadType === 'custom') {
            const option = document.createElement('option');
            option.value = 'custom';
            option.textContent = 'Произвольная резьба';
            standardSelect.appendChild(option);

            // Показываем поля для произвольной настройки
            document.querySelectorAll('.modal-input').forEach(input => {
                input.disabled = false;
            });
        } else {
            // Включаем все поля ввода
            document.querySelectorAll('.modal-input').forEach(input => {
                input.disabled = false;
            });

            // Отключаем диаметр и шаг если выбран стандарт
            document.getElementById('threadDiameter').disabled = true;
            document.getElementById('threadPitch').disabled = true;
            document.getElementById('threadAngle').disabled = true;

            // Заполняем стандарты
            Object.keys(standards).forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = key;
                standardSelect.appendChild(option);
            });

            // Выбираем первый стандарт
            if (Object.keys(standards).length > 0) {
                standardSelect.value = Object.keys(standards)[0];
                this.updateThreadParamsFromStandard();
            }
        }
    }

    /**
     * Обновляет параметры из выбранного стандарта
     */
    updateThreadParamsFromStandard() {
        const threadType = document.getElementById('threadType').value;
        const standard = document.getElementById('threadStandard').value;

        if (threadType === 'custom' || !this.threadStandards[threadType].standards[standard]) {
            return;
        }

        const params = this.threadStandards[threadType].standards[standard];

        // Обновляем поля ввода
        document.getElementById('threadDiameter').value = params.diameter.toFixed(2);
        document.getElementById('threadPitch').value = params.pitch.toFixed(2);
        document.getElementById('threadAngle').value = params.threadAngle || 60;

        // Обновляем превью
        this.updateThreadPreview();
    }

    /**
     * Создает резьбу из параметров UI
     */
    createThreadFromUI() {
        const params = {
            type: document.getElementById('threadType').value,
            standard: document.getElementById('threadStandard').value,
            diameter: parseFloat(document.getElementById('threadDiameter').value),
            pitch: parseFloat(document.getElementById('threadPitch').value),
            threadAngle: parseFloat(document.getElementById('threadAngle').value),
            length: parseFloat(document.getElementById('threadLength').value),
            direction: document.getElementById('threadDirection').value,
            threadType: document.getElementById('threadDirectionType').value,
            quality: document.getElementById('threadQuality').value,
            chamfer: document.getElementById('threadChamfer').checked,
            chamferAngle: 45,
            minorDiameter: 0 // Рассчитаем ниже
        };

        // Рассчитываем внутренний диаметр
        if (params.type === 'metric' || params.type === 'inch') {
            params.minorDiameter = params.diameter - (params.pitch * 1.082532);
        } else if (params.type === 'trapezoidal') {
            params.minorDiameter = params.diameter - params.pitch * 1.5;
        } else if (params.type === 'pipe') {
            params.minorDiameter = params.diameter - (params.pitch * 0.960491);
        } else {
            params.minorDiameter = params.diameter - (params.pitch * 1.2);
        }

        // Проверка параметров
        if (params.diameter <= 0 || params.pitch <= 0 || params.length <= 0) {
            alert('Некорректные параметры резьбы');
            return;
        }

        if (params.pitch > params.diameter / 2) {
            if (!confirm('Шаг резьбы слишком большой для данного диаметра. Продолжить?')) {
                return;
            }
        }

        // Создаем резьбу
        const thread = this.createThread(params);

        // Добавляем в сцену
        this.editor.objectsGroup.add(thread);
        this.editor.objects.push(thread);

        // Выделяем новую резьбу
        this.editor.selectObject(thread);

        // Добавляем в историю
        this.editor.history.addAction({
            type: 'create',
            object: thread.uuid,
            data: this.editor.projectManager.serializeObjectForHistory(thread)
        });

        // Обновляем статистику
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();

        // Закрываем модальное окно
        document.querySelector('#threadModal').remove();

        const typeName = params.threadType === 'external' ? 'наружную' : 'внутреннюю';
        this.editor.showStatus(`Создана ${typeName} резьба ${params.diameter}мм, шаг ${params.pitch}мм`, 'success');
    }

    /**
     * Обновляет превью резьбы
     */
    updateThreadPreview() {
        const preview = document.getElementById('threadPreview');

        // Простое текстовое превью
        const diameter = document.getElementById('threadDiameter').value;
        const pitch = document.getElementById('threadPitch').value;
        const length = document.getElementById('threadLength').value;
        const threadType = document.getElementById('threadDirectionType').value;

        preview.innerHTML = `
            <div style="text-align: center; color: #ccc;">
                <i class="fas fa-${threadType === 'external' ? 'screwdriver' : 'circle'} fa-3x"></i><br>
                <div style="margin-top: 10px;">
                    <strong>${threadType === 'external' ? 'Наружная' : 'Внутренняя'} резьба</strong><br>
                    <small>Ø${diameter}мм, шаг ${pitch}мм, длина ${length}мм</small>
                </div>
            </div>
        `;
    }

    /**
     * Создает резьбу на существующем цилиндре
     */
    createThreadOnCylinder(cylinder, params) {
        // Создаем резьбу с параметрами, соответствующими цилиндру
        const threadParams = {
            ...params,
            diameter: cylinder.geometry.parameters.radiusTop * 2,
            length: cylinder.geometry.parameters.height
        };

        const thread = this.createThread(threadParams);

        // Позиционируем резьбу на цилиндре
        thread.position.copy(cylinder.position);
        thread.rotation.copy(cylinder.rotation);

        return thread;
    }

    /**
     * Экспортирует параметры резьбы
     */
    exportThreadSpecs(thread) {
        if (!thread.userData || !thread.userData.threadParams) {
            return null;
        }

        const params = thread.userData.threadParams;

        return {
            type: params.type,
            standard: params.standard,
            diameter: params.diameter,
            pitch: params.pitch,
            minorDiameter: params.minorDiameter,
            length: params.length,
            direction: params.direction,
            threadType: params.threadType,
            quality: params.quality,
            volume: this.calculateThreadVolume(params)
        };
    }

    /**
     * Рассчитывает объем материала резьбы
     */
    calculateThreadVolume(params) {
        // Упрощенный расчет объема
        const area = Math.PI * Math.pow(params.diameter / 2, 2);
        const minorArea = Math.PI * Math.pow(params.minorDiameter / 2, 2);

        if (params.threadType === 'external') {
            // Объем стержня минус объем вырезанной резьбы
            return (area - minorArea) * params.length;
        } else {
            // Объем материала для внутренней резьбы
            return area * params.length;
        }
    }
}