// library-manager.js
class LibraryManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.libraryItems = [];
        this.draggingItem = null;
        this.dragPreview = null;
        this.lastMousePosition = new THREE.Vector2();

        // Стандартный размер для всех примитивов
        this.defaultSize = 25;

        this.initLibraryItems();
        this.initLibraryUI();
        this.initDragAndDrop();
    }

    initLibraryItems() {
        // Примитивы с PNG иконками
        this.libraryItems = [
            // Базовые примитивы
            {
                id: 'cube',
                name: 'Куб',
                type: 'primitive',
                category: 'basic',
                iconPath: 'icons/cube.png',
                createFunction: (position) => this.createPrimitive('cube', position)
            },
            {
                id: 'sphere',
                name: 'Сфера',
                type: 'primitive',
                category: 'basic',
                iconPath: 'icons/sphere.png',
                createFunction: (position) => this.createPrimitive('sphere', position)
            },
            {
                id: 'cylinder',
                name: 'Цилиндр',
                type: 'primitive',
                category: 'basic',
                iconPath: 'icons/cylinder.png',
                createFunction: (position) => this.createPrimitive('cylinder', position)
            },
            {
                id: 'cone',
                name: 'Конус',
                type: 'primitive',
                category: 'basic',
                iconPath: 'icons/cone.png',
                createFunction: (position) => this.createPrimitive('cone', position)
            },
            {
                id: 'torus',
                name: 'Тор',
                type: 'primitive',
                category: 'basic',
                iconPath: 'icons/torus.png',
                createFunction: (position) => this.createPrimitive('torus', position)
            },
            {
                id: 'plane',
                name: 'Плоскость',
                type: 'primitive',
                category: 'basic',
                iconPath: 'icons/plane.png',
                createFunction: (position) => this.createPrimitive('plane', position)
            },

            // Полезные формы
            {
                id: 'pyramid',
                name: 'Пирамида',
                type: 'primitive',
                category: 'shapes',
                iconPath: 'icons/pyramid.png',
                createFunction: (position) => this.createPrimitive('pyramid', position)
            },
//            {
//                id: 'wedge',
//                name: 'Клин',
//                type: 'primitive',
//                category: 'shapes',
//                iconPath: 'icons/wedge.png',
//                createFunction: (position) => this.createPrimitive('wedge', position)
//            },
            {
                id: 'tube',
                name: 'Труба',
                type: 'primitive',
                category: 'shapes',
                iconPath: 'icons/tube.png',
                createFunction: (position) => this.createPrimitive('tube', position)
            },

//            // Примеры STL моделей
//            {
//                id: 'gear',
//                name: 'Шестерня',
//                type: 'stl_model',
//                category: 'mechanical',
//                iconPath: 'icons/gear.png',
//                modelPath: 'models/gear.stl',
//                createFunction: (position) => this.loadSTLModel('models/gear.stl', 'Шестерня', position)
//            },
//            {
//                id: 'nut',
//                name: 'Гайка M6',
//                type: 'stl_model',
//                category: 'fasteners',
//                iconPath: 'icons/nut.png',
//                modelPath: 'models/nut_m6.stl',
//                createFunction: (position) => this.loadSTLModel('models/nut_m6.stl', 'Гайка M6', position)
//            },
//            {
//                id: 'screw',
//                name: 'Винт M4',
//                type: 'stl_model',
//                category: 'fasteners',
//                iconPath: 'icons/screw.png',
//                modelPath: 'models/screw_m4.stl',
//                createFunction: (position) => this.loadSTLModel('models/screw_m4.stl', 'Винт M4', position)
//            },
//            {
//                id: 'bracket',
//                name: 'Кронштейн',
//                type: 'stl_model',
//                category: 'mechanical',
//                iconPath: 'icons/bracket.png',
//                modelPath: 'models/bracket.stl',
//                createFunction: (position) => this.loadSTLModel('models/bracket.stl', 'Кронштейн', position)
//            },
            {
                id: 'bob',
                name: 'Боб',
                type: 'stl_model',
                category: 'mechanical',
                iconPath: 'icons/bob.png',
                modelPath: 'models/bob.stl',
                createFunction: (position) => this.loadSTLModel('models/bob.stl', 'Боб', position)
            }
        ];
    }

    initLibraryUI() {
        this.renderLibraryGrid();
        this.initSearch();
        this.initFilters();

        // Добавляем кнопку загрузки STL
    //    this.addUploadButtonToUI();
    }

    renderLibraryGrid(filter = 'all') {
        const grid = document.getElementById('libraryGrid');
        if (!grid) return;

        grid.innerHTML = '';

        // Исправляем фильтрацию
        const filteredItems = filter === 'all'
            ? this.libraryItems
            : this.libraryItems.filter(item => {
                if (filter === 'primitives') {
                    return item.type === 'primitive';
                } else if (filter === 'models') {
                    return item.type === 'stl_model';
                }
                return true;
            });

        console.log(`Filter: ${filter}, Filtered items: ${filteredItems.length}`);

        filteredItems.forEach(item => {
            const element = this.createLibraryElement(item);
            grid.appendChild(element);
        });
    }

    createLibraryElement(item) {
        const div = document.createElement('div');
        div.className = 'library-item';
        div.draggable = true;
        div.dataset.itemId = item.id;
        div.dataset.itemType = item.type;

        // Определяем fallback иконку на основе типа
        let fallbackIcon = 'cube';
        if (item.type === 'stl_model') {
            fallbackIcon = 'download';
        } else if (item.category === 'basic') {
            fallbackIcon = 'cube';
        } else if (item.category === 'shapes') {
            fallbackIcon = 'shapes';
        }

        // Создаем HTML с img тегом для PNG иконки
        div.innerHTML = `
            <div class="library-item-icon">
                ${item.iconPath ?
                    `<img src="${item.iconPath}" alt="${item.name}" class="library-item-img" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-${fallbackIcon}\\'></i>';">` :
                    `<i class="fas fa-${fallbackIcon}"></i>`
                }
            </div>
            <div class="library-item-info">
                <div class="library-item-name">${item.name}</div>
                <div class="library-item-category">${this.getCategoryName(item.category)}</div>
            </div>
            <div class="library-item-badge">
                <i class="fas fa-${item.type === 'stl_model' ? 'download' : 'cube'}"></i>
            </div>
        `;

        div.addEventListener('dragstart', (e) => this.onDragStart(e, item));
        div.addEventListener('dragend', (e) => this.onDragEnd(e));

        // Клик для быстрого создания в центре вида
        div.addEventListener('click', () => this.onItemClick(item));

        return div;
    }

    getCategoryName(category) {
        const categories = {
            'basic': 'Базовые',
            'shapes': 'Формы',
            'mechanical': 'Механика',
            'fasteners': 'Крепеж'
        };
        return categories[category] || category;
    }

    initSearch() {
        const searchInput = document.getElementById('librarySearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                this.filterLibrary(searchTerm);
            });
        }
    }

    initFilters() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const filter = e.target.dataset.filter;
                console.log(`Applying filter: ${filter}`);
                this.renderLibraryGrid(filter);
            });
        });
    }

    filterLibrary(searchTerm) {
        const grid = document.getElementById('libraryGrid');
        const allItems = document.querySelectorAll('.library-item');

        allItems.forEach(item => {
            const name = item.querySelector('.library-item-name').textContent.toLowerCase();
            const category = item.querySelector('.library-item-category').textContent.toLowerCase();

            if (name.includes(searchTerm) || category.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

//    addUploadButtonToUI() {
//        const controls = document.querySelector('.library-controls');
//        if (!controls) return;
//
//        const uploadBtn = document.createElement('button');
//        uploadBtn.className = 'filter-btn';
//        uploadBtn.id = 'uploadSTLBtn';
//        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Загрузить STL';
//        uploadBtn.title = 'Загрузить свой STL файл';
//        uploadBtn.style.marginLeft = 'auto';
//        uploadBtn.style.flex = 'none';
//
//        uploadBtn.addEventListener('click', () => {
//            this.openSTLFileDialog();
//        });
//
//        // Вставляем перед grid
//        const grid = document.getElementById('libraryGrid');
//        if (grid && grid.parentNode) {
//            grid.parentNode.insertBefore(uploadBtn, grid);
//        }
//    }

    // ДРАГ-ЭНД-ДРОП
    initDragAndDrop() {
        const viewport = document.getElementById('viewport');

        viewport.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';

            // Сохраняем позицию мыши для превью
            this.lastMousePosition.set(e.clientX, e.clientY);

            // Обновляем превью
            if (this.dragPreview && this.draggingItem) {
                this.updateDragPreview();
            }
        });

        viewport.addEventListener('drop', (e) => {
            e.preventDefault();

            if (!this.draggingItem) return;

            // Получаем точку на рабочей плоскости под курсором
            const position = this.getDropPosition(e);

            if (position) {
                // Создаем объект в полученной позиции
                this.createFromLibrary(this.draggingItem, position);
            }

            // Очищаем
            this.clearDragPreview();
            this.draggingItem = null;
        });

        viewport.addEventListener('dragleave', () => {
            this.clearDragPreview();
        });
    }

    onDragStart(e, item) {
        this.draggingItem = item;
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'copy';

        e.target.classList.add('dragging');

        // Создаем превью объекта с таким же размером, как оригинал
        this.createDragPreview(item);
    }

    onDragEnd(e) {
        e.target.classList.remove('dragging');
        this.clearDragPreview();
        this.draggingItem = null;
    }

    onItemClick(item) {
        // При клике создаем объект в центре рабочей плоскости
        const position = this.getCenterViewPosition();
        this.createFromLibrary(item, position);
    }

    createDragPreview(item) {
        if (this.dragPreview) {
            this.editor.scene.remove(this.dragPreview);
        }

        // Создаем превью с ТАКИМ ЖЕ размером, как оригинал
        let geometry;
        const size = this.defaultSize;

        if (item.type === 'stl_model') {
            // Для STL моделей показываем куб такого же размера
            geometry = new THREE.BoxGeometry(size, size, size);
        } else {
            // Для примитивов создаем точную копию геометрии
            switch(item.id) {
                case 'cube':
                    geometry = new THREE.BoxGeometry(size, size, size);
                    break;
                case 'sphere':
                    geometry = new THREE.SphereGeometry(size/2, 16, 16);
                    break;
                case 'cylinder':
                    geometry = new THREE.CylinderGeometry(size/2, size/2, size, 16);
                    break;
                case 'cone':
                    geometry = new THREE.ConeGeometry(size/2, size, 16);
                    break;
                case 'torus':
                    geometry = new THREE.TorusGeometry(size/1.66, size/5, 8, 16);
                    break;
                case 'plane':
                    geometry = new THREE.PlaneGeometry(size, size);
                    break;
                case 'pyramid':
                    geometry = new THREE.ConeGeometry(size/2, size, 4);
                    break;
                case 'wedge':
                    geometry = this.createWedgeGeometry(size, size, size);
                    break;
                case 'tube':
                    geometry = new THREE.CylinderGeometry(size/2, size/2, size, 16, 1, true);
                    break;
                default:
                    geometry = new THREE.BoxGeometry(size, size, size);
            }
        }

        const material = new THREE.MeshPhongMaterial({
            color: item.type === 'stl_model' ? 0x8BC34A : 0x2196F3,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            wireframe: false
        });

        this.dragPreview = new THREE.Mesh(geometry, material);
        this.dragPreview.visible = false;
        this.editor.scene.add(this.dragPreview);
    }

    updateDragPreview() {
        if (!this.dragPreview || !this.draggingItem) return;

        // Используем последнюю позицию мыши
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: this.lastMousePosition.x,
            clientY: this.lastMousePosition.y
        });

        const position = this.getDropPosition(mouseEvent);
        if (position) {
            this.dragPreview.position.copy(position);
            this.dragPreview.visible = true;

            // Правильная ориентация для плоскости
            if (this.draggingItem.id === 'plane') {
                this.dragPreview.rotation.x = -Math.PI / 2;
            } else {
                this.dragPreview.rotation.set(0, 0, 0);
            }
        }
    }

    getDropPosition(e) {
        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.editor.camera);

        // Пытаемся найти пересечение с рабочей плоскостью Y=0
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(plane, intersection)) {
            // Для плоских объектов (плоскость) не поднимаем
            if (this.draggingItem && this.draggingItem.id === 'plane') {
                return intersection;
            }

            // Для 3D объектов поднимаем на половину высоты
            intersection.y += this.defaultSize / 2;
            return intersection;
        }

        return null;
    }

    getCenterViewPosition() {
        // Получаем позицию в центре рабочей плоскости под камерой
        const center = new THREE.Vector2(0, 0);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(center, this.editor.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(plane, intersection)) {
            // Поднимаем на половину высоты для 3D объектов
            intersection.y += this.defaultSize / 2;
            return intersection;
        }

        // Если не нашли пересечения, возвращаем точку на расстоянии от камеры
        const distance = 100;
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.editor.camera.quaternion);

        const worldPos = this.editor.camera.position.clone()
            .add(direction.multiplyScalar(distance));

        // Находим проекцию на плоскость Y=0
        const t = -worldPos.y / direction.y;
        const position = worldPos.clone().add(direction.multiplyScalar(t));

        return position;
    }

    clearDragPreview() {
        if (this.dragPreview) {
            this.editor.scene.remove(this.dragPreview);
            this.dragPreview = null;
        }
    }

    createFromLibrary(item, position) {
        if (item.createFunction) {
            item.createFunction(position);
            this.editor.showStatus(`Создан: ${item.name}`, 'success');
        }
    }

    safeCloneParameters(parameters) {
        const cloned = {};
        for (const key in parameters) {
            const value = parameters[key];
            if (value && value.isVector3) {
                cloned[key] = value.toArray();
            } else if (value && value.isEuler) {
                cloned[key] = [value.x, value.y, value.z];
            } else if (value && value.isColor) {
                cloned[key] = value.getHex();
            } else if (typeof value !== 'function') {
                cloned[key] = value;
            }
        }
        return cloned;
    }

    // ОБЩИЙ МЕТОД ДЛЯ СОЗДАНИЯ ПРИМИТИВОВ
    createPrimitive(type, position) {
        let geometry;
        const size = this.defaultSize;

        switch(type) {
            case 'cube':
                geometry = new THREE.BoxGeometry(size, size, size);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(size/2, 32, 32);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(size/2, size/2, size, 32);
                break;
            case 'cone':
                geometry = new THREE.ConeGeometry(size/2, size, 32);
                break;
            case 'torus':
                geometry = new THREE.TorusGeometry(size/1.66, size/5, 16, 100);
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(size, size);
                break;
            case 'pyramid':
                geometry = new THREE.ConeGeometry(size/2, size, 4);
                break;
            case 'wedge':
                geometry = this.createWedgeGeometry(size, size, size);
                break;
            case 'tube':
                geometry = new THREE.CylinderGeometry(size/2, size/2, size, 32, 1, true);
                break;
            default:
                geometry = new THREE.BoxGeometry(size, size, size);
        }

        // Цвета для разных типов примитивов
        const colors = {
            cube: 0x4CAF50,      // Зеленый
            sphere: 0x2196F3,    // Синий
            cylinder: 0xFF9800,  // Оранжевый
            cone: 0xE91E63,      // Розовый
            torus: 0x9C27B0,     // Фиолетовый
            plane: 0x607D8B,     // Серо-синий
            pyramid: 0x00BCD4,   // Бирюзовый
            wedge: 0xFF5722,     // Красновато-оранжевый
            tube: 0x795548       // Коричневый
        };

        const material = new THREE.MeshPhongMaterial({
            color: colors[type] || 0xAAAAAA,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Устанавливаем позицию именно туда, куда перетащили
        if (position) {
            mesh.position.copy(position);
        } else {
            // Запасной вариант: центр рабочей плоскости
            mesh.position.set(0, type === 'plane' ? 0 : size/2, 0);
        }

        // Для плоскости ориентируем ее горизонтально
        if (type === 'plane') {
            mesh.rotation.x = -Math.PI / 2;
        }


        // ВАЖНО: Сохраняем оригинальную позицию ДО анимации
        const originalPosition = mesh.position.clone();
        const originalScale = mesh.scale.clone();

        // Настройка пользовательских данных с сохранением размеров
        mesh.userData = {
            id: `${type}_${Date.now()}`,
            name: this.getPrimitiveName(type),
            type: type,
            originalSize: { x: size, y: size, z: size },
            originalPosition: originalPosition.toArray(), // Сохраняем позицию
            originalScale: originalScale.toArray(), // Сохраняем масштаб
            geometryType: geometry.type,
            geometryParams: geometry.parameters ? this.safeCloneParameters(geometry.parameters) : {},
            materialColor: colors[type] || 0xAAAAAA,
            createdAt: new Date().toISOString(),
            unit: 'mm',
            // Добавляем флаг для восстановления
            needsAnimation: true
        };

        // Сохраняем originalMaterial с правильным цветом
        const originalMaterial = material.clone();
        originalMaterial.color.setHex(colors[type] || 0xAAAAAA);
        mesh.userData.originalMaterial = originalMaterial;

        // Добавляем в сцену
        this.editor.objectsGroup.add(mesh);
        this.editor.objects.push(mesh);

        // Анимация появления - но сохраняем оригинальное состояние
        mesh.scale.set(0.1, 0.1, 0.1);
        new TWEEN.Tween(mesh.scale)
            .to({ x: 1, y: 1, z: 1 }, 300)
            .easing(TWEEN.Easing.Elastic.Out)
            .start()
            .onComplete(() => {
                // После анимации обновляем originalScale
                mesh.userData.originalScale = [1, 1, 1];
            });

        // Выбираем созданный объект
        this.editor.clearSelection();
        this.editor.selectObject(mesh);

        // Обновляем статистику
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();

        // ДОБАВЛЯЕМ В ИСТОРИЮ с полной сериализацией объекта
        const serializedObject = this.editor.projectManager.serializeObjectForHistory(mesh);
        this.editor.history.addAction({
            type: 'create',
            subtype: 'library',
            object: mesh.uuid,
            data: serializedObject
        });

        return mesh;
    }

    createWedgeGeometry(width, height, depth) {
        // Создаем клинообразную геометрию (призму)
        const shape = new THREE.Shape();
        shape.moveTo(-width/2, -depth/2);
        shape.lineTo(width/2, -depth/2);
        shape.lineTo(width/2, depth/2);
        shape.lineTo(-width/2, depth/2);

        const extrudeSettings = {
            depth: height,
            bevelEnabled: false,
            steps: 1
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Поворачиваем, чтобы клин стоял правильно
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, height/2, 0);

        return geometry;
    }

    getPrimitiveName(type) {
        const names = {
            cube: 'Куб',
            sphere: 'Сфера',
            cylinder: 'Цилиндр',
            cone: 'Конус',
            torus: 'Тор',
            plane: 'Плоскость',
            pyramid: 'Пирамида',
            wedge: 'Клин',
            tube: 'Труба'
        };
        return names[type] || 'Объект';
    }

    // МЕТОД ЗАГРУЗКИ STL МОДЕЛЕЙ (ИСПРАВЛЕННЫЙ)
    loadSTLModel(modelPath, modelName, position) {
        console.log(`Loading STL: ${modelPath}, ${modelName}`);

        // Показываем статус загрузки
        this.editor.showStatus(`Загрузка модели: ${modelName}...`, 'info');

        // Загружаем через XMLHttpRequest (работает лучше с file://)
        const xhr = new XMLHttpRequest();
        xhr.open('GET', modelPath, true);
        xhr.responseType = 'arraybuffer';

        xhr.onload = () => {
            if (xhr.status === 200 || xhr.status === 0) {
                const buffer = xhr.response;
                this.processSTLBuffer(buffer, modelName, position, modelPath);
            } else {
                console.error('Failed to load STL:', xhr.status);
                this.handleSTLLoadError(modelName, position, `HTTP ошибка: ${xhr.status}`);
            }
        };

        xhr.onerror = () => {
            console.error('XHR error loading STL');
            this.handleSTLLoadError(modelName, position, 'Ошибка сети');
        };

        // Пробуем загрузить через fetch для HTTP (если XHR не работает)
        setTimeout(() => {
            if (xhr.readyState !== 4) {
                xhr.abort();
                console.log('Trying fetch for STL...');
                this.loadSTLWithFetch(modelPath, modelName, position);
            }
        }, 2000);

        xhr.send();
    }

    // Альтернативный метод загрузки через fetch
    async loadSTLWithFetch(modelPath, modelName, position) {
        try {
            console.log(`Fetching STL from: ${modelPath}`);
            const response = await fetch(modelPath);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            this.processSTLBuffer(buffer, modelName, position, modelPath);
        } catch (error) {
            console.error('Fetch STL error:', error);
            this.handleSTLLoadError(modelName, position, error.message);
        }
    }

    //МЕТОД ОБРАБОТКИ STL

    processSTLBuffer(buffer, modelName, position, filePath) {
        try {
            if (!buffer || buffer.byteLength === 0) {
                throw new Error('Пустой файл');
            }

            console.log(`Processing STL buffer (${buffer.byteLength} bytes) for: ${modelName}`);

            // Используем методы из project-manager для парсинга STL
            if (!this.editor.projectManager) {
                throw new Error('ProjectManager не инициализирован');
            }

            // Проверяем формат STL
            const isBinary = this.editor.projectManager.isBinarySTL(buffer);
            console.log('STL format:', isBinary ? 'binary' : 'ascii');

            // Парсим STL
            const geometry = isBinary ?
                this.editor.projectManager.parseBinarySTL(buffer) :
                this.editor.projectManager.parseASCIISTL(buffer);

            if (!geometry) {
                throw new Error('Не удалось создать геометрию из STL');
            }

            console.log('STL geometry created, vertices:', geometry.attributes.position?.count || 0);

            // Вычисляем центр ограничивающей рамки геометрии
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Сдвигаем геометрию так, чтобы ее центр был в начале координат
            const positions = geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] -= center.x;
                positions[i + 1] -= center.y;
                positions[i + 2] -= center.z;
            }
            geometry.attributes.position.needsUpdate = true;

            // Пересчитываем ограничивающую рамку после сдвига
            geometry.computeBoundingBox();

            // Поворачиваем геометрию для нашей системы координат (Y-up)
            geometry.rotateX(-Math.PI / 2);

            // Создаем материал
            const material = new THREE.MeshPhongMaterial({
                color: 0x8BC34A, // Зеленый для STL моделей
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                shininess: 30
            });

            // Создаем меш
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Устанавливаем позицию (если указана)
            if (position) {
                mesh.position.copy(position);

                // Теперь меш уже центрирован, просто поднимаем на половину высоты
                geometry.computeBoundingBox();
                const bbox = geometry.boundingBox;
                const size = new THREE.Vector3();
                bbox.getSize(size);
                mesh.position.y += size.y / 2;
            } else {
                // По умолчанию ставим на рабочую плоскость
                geometry.computeBoundingBox();
                const bbox = geometry.boundingBox;
                const size = new THREE.Vector3();
                bbox.getSize(size);
                mesh.position.y = size.y / 2; // Поднимаем на половину высоты
            }

            // Извлекаем имя файла из filePath
            const filename = filePath ? filePath.split('/').pop() : 'unknown.stl';

            // Настраиваем пользовательские данные
            mesh.userData = {
                id: `stl_${Date.now()}`,
                name: modelName,
                type: 'stl',
                createdAt: new Date().toISOString(),
                unit: 'mm',
                filename: filename,
                vertexCount: geometry.attributes.position?.count || 0,
                sourcePath: filePath,
                originalGeometry: geometry // Сохраняем ссылку на геометрию
            };

            // Сохраняем originalMaterial
            const originalMaterial = material.clone();
            mesh.userData.originalMaterial = originalMaterial;

            // Добавляем в сцену
            this.editor.objectsGroup.add(mesh);
            this.editor.objects.push(mesh);

            // Анимация появления
            mesh.scale.set(0.1, 0.1, 0.1);
            new TWEEN.Tween(mesh.scale)
                .to({ x: 1, y: 1, z: 1 }, 300)
                .easing(TWEEN.Easing.Elastic.Out)
                .start();

            // Выбираем объект
            this.editor.clearSelection();
            this.editor.selectObject(mesh);

            // Обновляем статистику
            this.editor.objectsManager.updateSceneStats();
            this.editor.objectsManager.updateSceneList();

            // ДОБАВЛЯЕМ В ИСТОРИЮ с полной сериализацией
            const serializedObject = this.editor.projectManager.serializeObjectForHistory(mesh);
            this.editor.history.addAction({
                type: 'import',
                format: 'stl',
                object: mesh.uuid,
                data: serializedObject
            });

            this.editor.showStatus(`Модель "${modelName}" загружена (${mesh.userData.vertexCount} вершин)`, 'success');

        } catch (error) {
            console.error('Ошибка обработки STL:', error);
            this.handleSTLLoadError(modelName, position, error.message);
        }
    }

    // Обработка ошибок загрузки STL
    handleSTLLoadError(modelName, position, errorMessage) {
        console.warn(`Не удалось загрузить STL ${modelName}: ${errorMessage}`);

        // Определяем причину ошибки
        let userMessage = `Ошибка загрузки ${modelName}: ${errorMessage}`;

        if (errorMessage.includes('CORS') || errorMessage.includes('NetworkError')) {
            userMessage = 'Проблема с CORS. Запустите через веб-сервер: npx http-server --cors';
        } else if (errorMessage.includes('404')) {
            userMessage = 'Файл не найден. Убедитесь что STL файлы есть в папке models/';
        }

        this.editor.showStatus(userMessage, 'error');

        // Создаем заглушку
        this.createSTLPlaceholder(modelName, position);
    }

    // Метод для создания заглушки STL модели
    createSTLPlaceholder(modelName, position) {
        const size = this.defaultSize;
        const geometry = new THREE.BoxGeometry(size, size/4, size);
        const material = new THREE.MeshPhongMaterial({
            color: 0xFF9800, // Оранжевый для заглушек
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            wireframe: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (position) {
            mesh.position.copy(position);
            mesh.position.y += size/8;
        }

        mesh.userData = {
            id: `stl_placeholder_${Date.now()}`,
            name: `${modelName} (заглушка)`,
            type: 'stl_placeholder',
            originalSize: { x: size, y: size/4, z: size },
            createdAt: new Date().toISOString(),
            unit: 'mm'
        };

        this.editor.objectsGroup.add(mesh);
        this.editor.objects.push(mesh);

        // Анимация появления
        mesh.scale.set(0.1, 0.1, 0.1);
        new TWEEN.Tween(mesh.scale)
            .to({ x: 1, y: 1, z: 1 }, 300)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();

        // Выбираем объект
        this.editor.clearSelection();
        this.editor.selectObject(mesh);

        // Обновляем статистику
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();

        this.editor.showStatus(`Создана заглушка для: ${modelName}`, 'warning');

        return mesh;
    }

    // МЕТОД ДЛЯ ЗАГРУЗКИ ПОЛЬЗОВАТЕЛЬСКИХ STL ФАЙЛОВ
    openSTLFileDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.stl,.STL';
        input.multiple = false;

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const buffer = event.target.result;
                const modelName = file.name.replace('.stl', '').replace('.STL', '');

                // Определяем позицию для размещения
                const position = this.getCenterViewPosition();

                // Обрабатываем STL
                this.processSTLBuffer(buffer, modelName, position, file.name);
            };

            reader.onerror = () => {
                this.editor.showStatus('Ошибка чтения файла', 'error');
            };

            reader.readAsArrayBuffer(file);
        };

        input.click();
    }

    // Метод для дропа пользовательских STL файлов
    addCustomSTLModel(file, position) {
        const reader = new FileReader();
        const modelName = file.name.replace('.stl', '').replace('.STL', '');

        reader.onload = (event) => {
            const buffer = event.target.result;
            this.processSTLBuffer(buffer, modelName, position, file.name);
        };

        reader.onerror = () => {
            this.handleSTLLoadError(modelName, position, 'Ошибка чтения файла');
        };

        reader.readAsArrayBuffer(file);
    }
}