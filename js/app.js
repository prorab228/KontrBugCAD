// app.js
class CADEditor {
    constructor() {

        // Константы версии
        this.APP_VERSION = '0.5.1';
        this.APP_NAME = 'КонтрБагCAD';
        this.APP_AUTHOR = 'Лунев Валерий Константинович';

        // Основные свойства
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.objects = [];
        this.selectedObjects = [];
        this.currentTool = 'select';

        // Плоскости и скетчи
        this.workPlanes = [];
        this.sketchPlanes = [];
        this.hoveredPlane = null;
        this.hoveredFace = null;
        this.basePlanes = null;

        // Режимы
        this.sketchMode = null;
        this.workPlaneMode = null;
        this.currentSketchPlane = null;
        this.extrudeMode = false;
        this.selectedContour = null;
        this.extrudeArrow = null;

        // Группы
        this.worldGroup = null;
        this.objectsGroup = null;
        this.sketchGroup = null;

        // Помощники
        this.gridVisible = true;
        this.axesVisible = true;
        this.gridHelper = null;
        this.axesHelper = null;

        // Управление
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.spacePressed = false;
        this.originalMouseButtons = null;

        // Менеджеры
        this.history = null;
        this.storage = null;
        this.uiManager = null;
        this.transformControls = null;
        this.sketchTools = null;
        this.booleanOps = null;
        this.libraryManager = null;
        this.dragManager = null;

        // Новые менеджеры
        this.objectsManager = null;
        this.planesManager = null;
        this.extrudeManager = null;
        this.projectManager = null;

        // Параметры
        this.mmScale = 1;
        this.pendingPrimitive = null;

        // Для выбора граней
        this.faceSelectionObject = null;
        this.tempWorkPlane = null;

        this.frames = 0;
        this.lastTime = performance.now();
        this.fps = 60;

        this.focusCameraOnObject = this.focusCameraOnObject.bind(this);

        this.init();
    }

    // ИНИЦИАЛИЗАЦИЯ
    init() {
        this.initThreeJS();
        this.initManagers();
        this.initUI();
        this.initEventListeners();
        this.animate();
        this.initFileDrop(); // <-- Добавить эту строку
        this.planesManager.createBasePlanes();
    }

    initFileDrop() {
        const viewport = document.getElementById('viewport');

        viewport.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        });

        viewport.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.name.toLowerCase().endsWith('.stl')) {
                    // Получаем позицию дропа
                    const position = this.libraryManager.getDropPosition(e);
                    // Добавляем STL модель
                    this.libraryManager.addCustomSTLModel(file, position);
                }
            }
        });
    }

    initThreeJS() {
        const viewport = document.getElementById('viewport');
        const width = viewport.parentElement.clientWidth;
        const height = viewport.parentElement.clientHeight;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x1a1a1a, 1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        viewport.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        this.camera.position.set(100, 100, 100);
        this.camera.lookAt(0, 0, 0);

        this.worldGroup = new THREE.Group();
       // this.worldGroup.rotation.x = -Math.PI / 2;
        this.scene.add(this.worldGroup);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.configureOrbitControls();

        this.initLighting();
        this.initHelpers();

        this.objectsGroup = new THREE.Group();
        this.worldGroup.add(this.objectsGroup);

        this.sketchGroup = new THREE.Group();
        this.worldGroup.add(this.sketchGroup);

        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    focusCameraOnObject(object) {
        // Делегируем вызов менеджеру объектов
        if (this.objectsManager && object) {
            this.objectsManager.focusCameraOnObject(object);
        }
    }

    configureOrbitControls() {
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true;

        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE
        };

        this.controls.panSpeed = 1.0;
        this.controls.rotateSpeed = 1.0;
        this.controls.zoomSpeed = 1.0;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 500;
        this.controls.maxPolarAngle = Math.PI;
    }

    initManagers() {
        this.history = new HistoryManager(this);  // Передаем this (CADEditor)
        this.storage = new StorageManager();
     //   this.uiManager = new UIManager(this);
        this.transformControls = new TransformControls(this);
        this.sketchTools = new SketchTools(this);

        // Новые менеджеры
        this.objectsManager = new ObjectsManager(this);
        this.planesManager = new PlanesManager(this);
        this.extrudeManager = new ExtrudeManager(this);
        this.projectManager = new ProjectManager(this);
        this.libraryManager = new LibraryManager(this);
        this.dragManager = new DragManager(this);

        setTimeout(() => {
            if (typeof THREE_BVH_CSG === 'undefined') {
                console.warn('three-bvh-csg не загружена');
                this.showStatus('Булевы операции недоступны', 'warning');
            } else {
                this.booleanOps = new BooleanOperations(this);
                console.log('Менеджер булевых операций инициализирован с three-bvh-csg');
            }
        }, 100);
    }

    initLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight1.position.set(10, 20, 15);
        directionalLight1.castShadow = true;
        directionalLight1.shadow.camera.left = -20;
        directionalLight1.shadow.camera.right = 20;
        directionalLight1.shadow.camera.top = 20;
        directionalLight1.shadow.camera.bottom = -20;
        this.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-10, 10, -10);
        this.scene.add(directionalLight2);

        const pointLight = new THREE.PointLight(0xffffff, 0.5, 100);
        pointLight.position.set(0, 10, 0);
        this.scene.add(pointLight);
    }

    // app.js - исправленный initHelpers()
    initHelpers() {
        // Грид теперь лежит в плоскости XZ (горизонтальная плоскость)
        this.gridHelper = new THREE.GridHelper(500, 100, 0x444444);
        this.gridHelper.position.y = 0;  // Грид на высоте 0
        this.gridHelper.visible = this.gridVisible;
        this.worldGroup.add(this.gridHelper);

        // Оси оставляем как есть
        this.axesHelper = new THREE.AxesHelper(50);
        this.axesHelper.visible = this.axesVisible;
        this.worldGroup.add(this.axesHelper);

        // В методе initHelpers() добавьте:
        if (this.gridHelper) {
            const savedGridColor = localStorage.getItem('cad-grid-color');
            if (savedGridColor) {
                this.gridHelper.material.color.set(new THREE.Color(savedGridColor));
            }
        }
    }

    initUI() {

        document.getElementById('undo').addEventListener('click', () => this.undo());
        document.getElementById('redo').addEventListener('click', () => this.redo());

        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this.setCurrentTool(tool);
            });
        });

       this.objectsManager.updateSceneStats()
       //номер версии
       document.getElementById('version').innerHTML = `<strong>Версия:</strong> ${this.APP_VERSION}`;
    }

    // ОБРАБОТКА СОБЫТИЙ
    initEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        this.initMouseHandlers();
        this.initKeyboardHandlers();
        this.initFileOperations();
        this.initViewControls();
        this.initSketchTools();
        this.initBooleanOperations();
        this.initModalHandlers();
        this.initPanelTabs();
        this.initPropertyControls();

        this.initThemeControls();
        this.initEnvironmentControls();


        this.loadSavedProjects();
    }

    initThemeControls() {
//        const themeToggle = document.querySelector('.tool-btn .fa-sun').closest('.tool-btn');
//        if (themeToggle) {
//            themeToggle.addEventListener('click', () => {
//                const menu = themeToggle.nextElementSibling;
//                menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
//            });
//        }

        // Обработчики для кнопок темы
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = btn.dataset.theme;
                this.setTheme(theme);

                // Обновляем активное состояние
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Загружаем сохранённую тему
        const savedTheme = localStorage.getItem('cad-theme') || 'dark';
        this.setTheme(savedTheme);

        // Устанавливаем активную кнопку
        const activeBtn = document.querySelector(`.theme-btn[data-theme="${savedTheme}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    initEnvironmentControls() {
        // Цвет фона
        const bgColorPicker = document.getElementById('backgroundColor');
        if (bgColorPicker) {
            bgColorPicker.addEventListener('change', (e) => {
                this.renderer.setClearColor(new THREE.Color(e.target.value));
                localStorage.setItem('cad-bg-color', e.target.value);
            });

            // Загружаем сохранённый цвет
            const savedBgColor = localStorage.getItem('cad-bg-color') || '#1a1a1a';
            bgColorPicker.value = savedBgColor;
            this.renderer.setClearColor(new THREE.Color(savedBgColor));
        }

        // Цвет сетки
        const gridColorPicker = document.getElementById('gridColor');
        if (gridColorPicker && this.gridHelper) {
            gridColorPicker.addEventListener('change', (e) => {
                this.gridHelper.material.color.set(new THREE.Color(e.target.value));
                localStorage.setItem('cad-grid-color', e.target.value);
            });

            // Загружаем сохранённый цвет сетки
            const savedGridColor = localStorage.getItem('cad-grid-color') || '#444444';
            gridColorPicker.value = savedGridColor;
            if (this.gridHelper) {
                this.gridHelper.material.color.set(new THREE.Color(savedGridColor));
            }
        }

        // Сброс настроек
        const resetBtn = document.getElementById('resetEnvironment');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetEnvironment();
            });
        }
    }

    setTheme(theme) {
        const body = document.body;

        // Добавляем класс для плавного перехода
        body.classList.add('theme-transition');

        if (theme === 'auto') {
            // Автоматическое определение темы системы
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            body.classList.remove('dark-theme', 'light-theme');
            body.classList.add(prefersDark ? 'dark-theme' : 'light-theme');
        } else {
            body.classList.remove('dark-theme', 'light-theme');
            body.classList.add(`${theme}-theme`);
        }

        // Сохраняем выбор
        localStorage.setItem('cad-theme', theme);

        // Обновляем иконку в тулбаре
        const themeIcon = document.querySelector('.theme-controls .fa-sun, .theme-controls .fa-moon');
        if (themeIcon) {
            if (theme === 'light' || (theme === 'auto' && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                themeIcon.className = 'fas fa-sun';
            } else {
                themeIcon.className = 'fas fa-moon';
            }
        }

        // Убираем класс перехода после завершения анимации
        setTimeout(() => {
            body.classList.remove('theme-transition');
        }, 300);
    }

    resetEnvironment() {
        // Сбрасываем настройки по умолчанию
        localStorage.removeItem('cad-bg-color');
        localStorage.removeItem('cad-grid-color');

        // Сбрасываем цвет фона
        this.renderer.setClearColor(0x1a1a1a, 1);
        document.getElementById('backgroundColor').value = '#1a1a1a';

        // Сбрасываем цвет сетки
        if (this.gridHelper) {
            this.gridHelper.material.color.set(0x444444);
        }
        document.getElementById('gridColor').value = '#444444';

        this.showStatus('Настройки окружения сброшены', 'info');
    }



    initMouseHandlers() {
        const canvas = this.renderer.domElement;
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

        // обработчик двойного клика
        canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    }

    initKeyboardHandlers() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    initFileOperations() {
        document.getElementById('newProject').addEventListener('click', () => this.newProject());
        document.getElementById('openProject').addEventListener('click', () => this.openProject());
        document.getElementById('saveProject').addEventListener('click', () => this.showSaveModal());
        document.getElementById('exportSTL').addEventListener('click', () => this.showExportModal());
        document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
        document.getElementById('exportSVG').addEventListener('click', () => this.exportSVG());
        document.getElementById('openSTL').addEventListener('click', () => this.projectManager.openSTL());
    }

    initViewControls() {
        const views = {
            homeView: 'home',
            frontView: 'front',
            topView: 'top',
            rightView: 'right',
            leftView: 'left',
            backView: 'back',
            bottomView: 'bottom',
            isoView: 'isometric'
        };

        Object.entries(views).forEach(([id, view]) => {
            const element = document.getElementById(id);
            if (element) element.addEventListener('click', () => this.setView(view));
        });

        document.getElementById('toggleGrid').addEventListener('click', () => this.toggleGrid());
        document.getElementById('toggleAxes').addEventListener('click', () => this.toggleAxes());
        document.getElementById('toggleWireframe').addEventListener('click', () => this.toggleWireframe());
    }

    initSketchTools() {
        document.getElementById('openSketch').addEventListener('click', () => this.openSketch());
        document.getElementById('createSketchPlane').addEventListener('click', () => this.createWorkPlane());
        document.getElementById('extrudeSketch').addEventListener('click', () => this.startExtrudeMode());

        document.querySelectorAll('.sketch-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.sketchTool;
                this.setSketchTool(tool);
            });
        });

        document.getElementById('sketchDeleteBtn').addEventListener('click', () => {
            if (this.sketchTools) this.sketchTools.deleteSelected();
        });

        document.getElementById('sketchClearBtn').addEventListener('click', () => {
            if (this.sketchTools) this.sketchTools.clearSketch();
        });

        document.getElementById('exitSketchBtn').addEventListener('click', () => {
            this.exitSketchMode();
        });

        document.getElementById('toggleSketchGrid').addEventListener('click', () => {
            if (this.sketchTools) {
                this.sketchTools.toggleGrid();
                this.showStatus(`Сетка скетча: ${this.sketchTools.gridVisible ? 'вкл' : 'выкл'}`, 'info');
            }
        });
    }

    initBooleanOperations() {

        const initOps = () => {
            if (typeof ThreeCSG !== 'undefined') {
                this.booleanOps = new BooleanOperations(this);
                console.log('ThreeCSG loaded, BooleanOperations initialized');
            } else {
                console.warn('ThreeCSG not loaded yet, will retry...');
                // Пробуем еще раз через небольшой интервал
                setTimeout(initOps, 100);
            }
        };
        document.getElementById('booleanUnion').addEventListener('click', () => this.performUnion());
        document.getElementById('booleanSubtract').addEventListener('click', () => this.performSubtract());
        document.getElementById('booleanIntersect').addEventListener('click', () => this.performIntersect());
    }

    initModalHandlers() {
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                if (modal) modal.classList.remove('active');
            });
        });
        //О программе
        document.getElementById('aboutBtn').addEventListener('click', () => {
            // Если нужно динамически обновлять информацию:
            const modal = document.getElementById('aboutModal');
            modal.querySelector('h4').textContent = this.APP_NAME;
            modal.querySelector('p:nth-child(2)').innerHTML = `<strong>Версия:</strong> ${this.APP_VERSION}`;
            modal.querySelector('p:nth-child(3)').innerHTML = `<strong>Разработчик:</strong> ${this.APP_AUTHOR}`;
            modal.classList.add('active');
        });

        document.getElementById('cancelExport').addEventListener('click', () => {
            document.getElementById('exportModal').classList.remove('active');
        });

        document.getElementById('confirmExport').addEventListener('click', () => {
            this.exportModel();
            document.getElementById('exportModal').classList.remove('active');
        });

        document.getElementById('cancelSave').addEventListener('click', () => {
            document.getElementById('saveModal').classList.remove('active');
        });

        document.getElementById('confirmSave').addEventListener('click', () => {
            this.saveProject();
            document.getElementById('saveModal').classList.remove('active');
        });
    }

    initPanelTabs() {
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                document.getElementById(`${tabName}Content`).classList.add('active');
            });
        });
    }

    initPropertyControls() {
        const centerButtons = {
            centerX: 'x',
            centerY: 'y',
            centerZ: 'z',
            centerAll: 'all'
        };

        document.getElementById('applySize').addEventListener('click', () => {
            this.applySizeFromInputs();
        });

        // Обработчики для цвета и прозрачности
        document.getElementById('objectColor').addEventListener('input', (e) => {
            this.onObjectColorChange(e);
        });

        document.getElementById('objectOpacity').addEventListener('input', (e) => {
            this.onObjectOpacityChange(e);
        });

        Object.entries(centerButtons).forEach(([id, axis]) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => this.centerSelected(axis));
        });

        const extrudeSketchBtn = document.getElementById('extrudeSketchBtn');
        const cutSketchBtn = document.getElementById('cutSketchBtn');

        if (extrudeSketchBtn) extrudeSketchBtn.addEventListener('click', () => this.extrudeSketch());
        if (cutSketchBtn) cutSketchBtn.addEventListener('click', () => this.cutSketch());
    }

    handleDoubleClick(e) {
        if (e.button !== 0) return;

        this.updateMousePosition(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.objectsGroup.children, true);

        if (intersects.length > 0) {
            const object = this.objectsManager.findTopParent(intersects[0].object);

            // Проверяем, является ли объект плоскостью скетча
            if (object.userData.type === 'sketch_plane' ||
                object.userData.type === 'work_plane') {

                // Проверяем, есть ли элементы скетча на этой плоскости
                const hasSketchElements = this.checkPlaneForSketchElements(object);

                if (hasSketchElements) {
                    // Редактируем существующий скетч
                    this.selectSingleObject(object);
                    this.editExistingSketch(object);
                    return;
                }
            }
        }
    }

    // ОБРАБОТКА МЫШИ
    handleMouseDown(e) {
        const isLeftClick = e.button === 0;
        const isRightClick = e.button === 2;
        const isMiddleClick = e.button === 1;

        if (isLeftClick) {

            e.preventDefault();
            this.updateMousePosition(e);

            // Проверяем, не началось ли перетаскивание
            if (this.dragManager && this.dragManager.isDragging) {
                return;
            }

            if (this.transformControls && this.transformControls.onMouseDown(e, this.mouse)) {
                return;
            }

            // Обработка в зависимости от режима
            if (this.workPlaneMode === 'selecting_face') {
                this.planesManager.selectFaceForWorkPlane(e);
                return;
            } else if (this.workPlaneMode === 'selecting_plane') {
                this.planesManager.selectBasePlaneForWorkPlane(e);
                return;
            } else if (this.sketchMode === 'drawing' && this.sketchTools) {
                this.sketchTools.onMouseDown(e);
                return;
            } else if (this.extrudeMode) {
                // Пробуем начать перетаскивание стрелки
                if (this.extrudeManager.handleArrowDragStart(e)) {
                    return;
                }

                // Если не начали перетаскивать стрелку, выбираем контур
                if (this.extrudeManager.selectContourForExtrude(e)) {
                    return;
                }
            }

            this.handleStandardMouseDown(e);
        }

        if (isRightClick) document.body.style.cursor = 'grab';
        if (isMiddleClick) document.body.style.cursor = 'move';
    }

    handleMouseMove(e) {
        this.updateMousePosition(e);
        this.updateCoordinates(e);

        // Если идет перетаскивание, делегируем DragManager
        if (this.dragManager && this.dragManager.isDragging) {
            this.dragManager.onMouseMove(e);
            return;
        }

        if (this.transformControls && this.transformControls.isDragging) {
            this.transformControls.onMouseMove(e, this.mouse);
            return;
        }

        // Обработка в зависимости от режима
        if (this.workPlaneMode === 'selecting_face') {
            this.planesManager.highlightFacesForWorkPlane(e);
        } else if (this.workPlaneMode === 'selecting_plane') {
            this.planesManager.highlightBasePlanesForWorkPlane(e);
        } else if (this.sketchMode === 'drawing' && this.sketchTools) {
            this.sketchTools.onMouseMove(e);
        } else if (this.extrudeMode) {
            if (this.extrudeManager.dragging) {
                this.extrudeManager.handleArrowDrag(e);
                return;
            }
            this.extrudeManager.highlightContoursOnHover(e);
        } else {
            this.handleStandardMouseMove(e);
        }
    }

    handleMouseUp(e) {
        const isRightClick = e.button === 2;
        const isMiddleClick = e.button === 1;

        if (isRightClick || isMiddleClick) {
            document.body.style.cursor = 'default';
        }

        if (e.button === 0) {
            // Если было перетаскивание, завершаем его
            if (this.dragManager && this.dragManager.isDragging) {
                this.dragManager.onMouseUp(e);
                return;
            }

            // Сохранение transform операций в историю
            if (this.transformControls && this.transformControls.isDragging) {
                const obj = this.transformControls.attachedObject;
                if (obj) {
                    // Определяем тип операции
                    const mode = this.transformControls.getMode();
                    let actionType = '';
                    let actionData = {};

                    switch(mode) {
                        case 'translate':
                            actionType = 'modify_position';
                            actionData = {
                                position: obj.position.toArray(),
                                previousPosition: obj.userData.lastPosition || [0, 0, 0]
                            };
                            obj.userData.lastPosition = obj.position.toArray();
                            break;

                        case 'rotate':
                            actionType = 'modify_rotation';
                            actionData = {
                                rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                                previousRotation: obj.userData.lastRotation || [0, 0, 0]
                            };
                            obj.userData.lastRotation = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
                            break;

                        case 'scale':
                            actionType = 'modify_scale';
                            actionData = {
                                scale: obj.scale.toArray(),
                                previousScale: obj.userData.lastScale || [1, 1, 1]
                            };
                            obj.userData.lastScale = obj.scale.toArray();
                            break;
                    }

                    if (actionType) {
                        this.history.addAction({
                            type: actionType,
                            object: obj.uuid,
                            data: actionData
                        });
                    }
                }

                this.transformControls.onMouseUp();
                return;
            }

            if (this.sketchMode === 'drawing' && this.sketchTools) {
                this.sketchTools.onMouseUp(e);
            }

            if (this.extrudeManager && this.extrudeManager.dragging) {
                this.extrudeManager.handleArrowDragEnd();
                return;
            }
        }
    }

    handleMouseLeave() {
        if (this.transformControls && this.transformControls.isDragging) {
            this.transformControls.onMouseUp();
        }
    }

    updateMousePosition(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    handleStandardMouseDown(e) {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Создание примитива
//        if (this.pendingPrimitive) {
//            this.createPrimitive(this.pendingPrimitive, e);
//            this.setCurrentTool('select');
//            return;
//        }

        const intersects = this.raycaster.intersectObjects(this.objectsGroup.children, true);

        if (intersects.length > 0) {
            const object = this.objectsManager.findTopParent(intersects[0].object);

            if (event.ctrlKey || event.metaKey) {
                this.toggleObjectSelection(object);
            } else {
                this.selectSingleObject(object);
            }

            this.updatePropertiesPanel();
            this.updateStatus();
        } else {
            if (!['move', 'scale', 'rotate'].includes(this.currentTool)) {
                this.clearSelection();
            }
        }
    }

    handleStandardMouseMove(e) {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.currentTool === 'select' && !this.sketchMode && !this.extrudeMode) {
            const intersects = this.raycaster.intersectObjects(this.objectsGroup.children, true);
            // Можно добавить подсветку при наведении
        }
    }

    // ВЫБОР ОБЪЕКТОВ
    toggleObjectSelection(object) {
        const index = this.selectedObjects.indexOf(object);
        if (index > -1) {
            this.selectedObjects.splice(index, 1);
            this.objectsManager.unhighlightObject(object);
        } else {
            this.selectedObjects.push(object);
            this.objectsManager.highlightObject(object);
        }
    }

    selectSingleObject(object) {
        this.clearSelection();
        this.selectedObjects = [object];
        this.objectsManager.highlightObject(object);

        if (['move', 'scale', 'rotate'].includes(this.currentTool) && this.transformControls) {
            const mode = this.currentTool === 'move' ? 'translate' :
                        this.currentTool === 'scale' ? 'scale' : 'rotate';
            this.transformControls.attach(object);
            this.transformControls.updateMode(mode);
        }
    }

    selectObject(object) {
        this.selectedObjects = [object];
        this.objectsManager.highlightObject(object);
        this.updatePropertiesPanel();
        this.objectsManager.updateSceneList();
        this.updateStatus();
    }

    clearSelection() {
        this.selectedObjects.forEach(obj => this.objectsManager.unhighlightObject(obj));
        this.selectedObjects = [];

        if (this.transformControls) {
            this.transformControls.detach();
            this.transformControls.hide();
        }

        this.updatePropertiesPanel();
        this.updateStatus();
        this.setCurrentTool('select');
    }

    // ИНСТРУМЕНТЫ
    setCurrentTool(tool) {
        if (this.transformControls) {
            this.transformControls.detach();
        }

        // Выход из режимов при смене инструмента
        if (tool !== 'select' && this.sketchMode === 'drawing') {
            this.exitSketchMode();
        }

        if (tool !== 'extrude') {
            this.extrudeMode = false;
            this.selectedContour = null;
        }

        this.currentTool = tool;
        this.updateToolUI(tool);

        // Для инструментов трансформации
        if (['move', 'scale', 'rotate'].includes(tool) && this.selectedObjects.length === 1) {
            const mode = tool === 'move' ? 'translate' :
                        tool === 'scale' ? 'scale' : 'rotate';

            // Сохраняем текущее состояние перед изменением
            const obj = this.selectedObjects[0];
            if (obj) {
                switch(mode) {
                    case 'translate':
                        if (!obj.userData.lastPosition) {
                            obj.userData.lastPosition = obj.position.toArray();
                        }
                        break;
                    case 'rotate':
                        if (!obj.userData.lastRotation) {
                            obj.userData.lastRotation = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
                        }
                        break;
                    case 'scale':
                        if (!obj.userData.lastScale) {
                            obj.userData.lastScale = obj.scale.toArray();
                        }
                        break;
                }
            }

            if (this.transformControls) {
                this.transformControls.attach(obj);
                this.transformControls.setMode(mode);
                this.transformControls.show();
            }
        } else {
            if (this.transformControls) {
                this.transformControls.detach();
                this.transformControls.hide();
            }
        }

        this.updateStatus();
    }

    updateToolUI(tool) {
        document.querySelectorAll('.tool-btn, [data-tool]').forEach(b => {
            b.classList.remove('active', 'pending');
        });

        const activeBtn = document.querySelector(`[data-tool="${tool}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }



    // РАБОЧИЕ ПЛОСКОСТИ (для операций)
    createWorkPlane() {
        // Если выбран объект (и это не плоскость), начинаем выбор грани
        if (this.selectedObjects.length === 1 &&
            this.selectedObjects[0].userData.type !== 'work_plane' &&
            this.selectedObjects[0].userData.type !== 'sketch_plane' &&
            this.selectedObjects[0].userData.type !== 'base_plane') {
            this.planesManager.startWorkPlaneFaceSelection();
        } else {
            // Иначе начинаем выбор базовой плоскости
            this.planesManager.startWorkPlaneBaseSelection();
        }
    }

    // РАБОТА СО СКЕТЧАМИ
    openSketch() {
        if (this.sketchMode === 'drawing') {
            this.exitSketchMode();
            return;
        }

        // Если выбран объект, который является плоскостью скетча
        if (this.selectedObjects.length === 1) {
            const object = this.selectedObjects[0];

            // Проверяем, является ли объект плоскостью скетча
            if (object.userData.type === 'sketch_plane' ||
                object.userData.type === 'work_plane') {

                // Проверяем, есть ли на этой плоскости элементы скетча
                const hasSketchElements = this.checkPlaneForSketchElements(object);

                if (hasSketchElements) {
                    // Редактируем существующий скетч
                    this.editExistingSketch(object);
                } else {
                    // Создаем новый скетч на выбранной плоскости
                    this.startSketchOnPlane(object);
                }
                return;
            }
        }

        this.showStatus('Выберите плоскость для скетча (рабочую или скетч-плоскость)', 'error');
    }

    // Проверяем, содержит ли плоскость элементы скетча
    checkPlaneForSketchElements(planeObject) {
        if (!planeObject || !planeObject.children) return false;

        for (const child of planeObject.children) {
            if (child.userData && child.userData.type === 'sketch_element') {
                return true;
            }
        }

        return false;
    }

    // Метод для редактирования существующего скетча
    editExistingSketch(planeObject) {
        if (!this.sketchTools) return;

        // Запускаем режим редактирования
        this.sketchMode = 'drawing';
        this.sketchTools.editExistingSketch(planeObject);

        // Показываем инструменты скетча
        document.getElementById('sketchToolsSection').style.display = 'flex';
        this.setCurrentTool('select');
        this.showStatus('Режим редактирования скетча. Используйте инструменты рисования.', 'info');
    }

    startSketchOnPlane(plane) {
        // Создаем отдельную плоскость для скетча на основе выбранной плоскости
        const sketchPlane = this.planesManager.createSketchPlaneObject();

        // Копируем позицию и ориентацию
        sketchPlane.position.copy(plane.position);
        sketchPlane.quaternion.copy(plane.quaternion);

        this.objectsGroup.add(sketchPlane);
        this.objects.push(sketchPlane);
        this.sketchPlanes.push(sketchPlane);

        this.currentSketchPlane = sketchPlane;
        this.sketchMode = 'drawing';

        // Показываем инструменты скетча
        document.getElementById('sketchToolsSection').style.display = 'flex';

        if (this.sketchTools) {
            this.sketchTools.startSketchOnPlane(sketchPlane);
            this.sketchTools.setCurrentTool('line');
        }

        // Убираем старый вызов planesManager.setCameraForSketch
        // Камера будет настроена в sketchTools.orientCameraToPlane

        this.setSketchTool('line');
        this.showStatus('Режим скетча: используйте инструменты рисования', 'info');
    }

    exitSketchMode() {
        if (this.sketchMode === null) return;

        this.sketchMode = null;
        this.currentSketchPlane = null;

        document.getElementById('sketchToolsSection').style.display = 'none';

        if (this.sketchTools) {
            this.sketchTools.exitSketchMode();
        }

        this.setCurrentTool('select');
        this.showStatus('Режим скетча завершен', 'info');
    }

    setSketchTool(tool) {
        if (this.sketchTools && this.sketchMode === 'drawing') {
            this.sketchTools.setCurrentTool(tool);

            document.querySelectorAll('.sketch-tool-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.sketchTool === tool) {
                    btn.classList.add('active');
                }
            });

            // Обновляем информацию о текущем инструменте
            const toolNames = {
                select: 'Выделение',
                line: 'Линия',
                rectangle: 'Прямоугольник',
                circle: 'Окружность',
                polyline: 'Полилиния'
            };

            if (this.sketchTools.sizeDisplay) {
                const sizeInfo = this.sketchTools.sizeDisplay.querySelector('#sizeInfo');
                if (sizeInfo) {
                    sizeInfo.textContent = `Инструмент: ${toolNames[tool] || tool}`;
                }
            }
        }
    }

    // ВЫТЯГИВАНИЕ СКЕТЧА
    // app.js - исправленный метод startExtrudeMode
    startExtrudeMode() {
        // Используем менеджер объектов для получения элементов
        const closedContours = this.objectsManager.getClosedSketchElements();

        console.log("Замкнутых контуров для выдавливания:", closedContours.length);

        if (closedContours.length === 0) {
            this.showStatus('Нет замкнутых контуров для вытягивания', 'error');

            // Для отладки покажем все элементы
            const allElements = this.objectsManager.getAllSketchElements();
            console.log("Всего скетч-элементов:", allElements.length);
            allElements.forEach((element, index) => {
                console.log(`Элемент ${index}:`, {
                    type: element.userData?.elementType,
                    isClosed: element.userData?.isClosed,
                    userData: element.userData
                });
            });

            return;
        }

        this.extrudeMode = true;
        this.currentTool = 'extrude';
        this.selectedContour = null;

        this.extrudeManager.showExtrudeUI();
        this.showStatus('Выберите замкнутый контур скетча для вытягивания. Подсвечены доступные контуры.', 'info');

        // Подсвечиваем замкнутые контуры
        this.extrudeManager.highlightExtrudableContours();
    }


   //СМЕНА ЦВЕТА

   onObjectColorChange(e) {
        if (this.selectedObjects.length !== 1) return;

        const object = this.selectedObjects[0];

        // Проверяем, что объект имеет материал
        let material = object.material;

        // Если material не существует, создаем его
        if (!material) {
            console.warn('Объект не имеет материала, создаем новый');
            material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                side: THREE.FrontSide
            });
            object.material = material;

            // Сохраняем в userData
            if (!object.userData.originalMaterial) {
                object.userData.originalMaterial = material.clone();
            }
        }

        // Проверяем, что материал имеет свойство color
        if (!material.color) {
            this.showStatus('Материал объекта не поддерживает изменение цвета', 'error');
            return;
        }

        const newColor = e.target.value;

        // Сохраняем предыдущий цвет для истории
        const previousColor = material.color.getHex ? material.color.getHex() : 0x808080;

        // Обновляем цвет
        this.setObjectColor(object, newColor);

        // Добавляем в историю
        this.history.addAction({
            type: 'modify_color',
            object: object.uuid,
            data: {
                color: newColor,
                previousColor: previousColor
            }
        });
    }


    onObjectOpacityChange(e) {
        if (this.selectedObjects.length !== 1) return;

        const object = this.selectedObjects[0];

        // Проверяем, что объект имеет материал
        let material = object.material;

        // Если material не существует, создаем его
        if (!material) {
            console.warn('Объект не имеет материала, создаем новый');
            material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                side: THREE.FrontSide,
                transparent: true
            });
            object.material = material;

            // Сохраняем в userData
            if (!object.userData.originalMaterial) {
                object.userData.originalMaterial = material.clone();
            }
        }

        const opacity = parseFloat(e.target.value);

        // Сохраняем предыдущую прозрачность для истории
        const previousOpacity = material.opacity !== undefined ? material.opacity : 1.0;

        // Обновляем прозрачность
        this.setObjectOpacity(object, opacity);

        // Добавляем в историю
        this.history.addAction({
            type: 'modify_opacity',
            object: object.uuid,
            data: {
                opacity: opacity,
                previousOpacity: previousOpacity
            }
        });
    }

    setObjectColor(object, colorValue) {
        if (!object) return;

        // Создаем новый цвет
        const newColor = new THREE.Color(colorValue);

        // Если у объекта нет материала, создаем его
        if (!object.material) {
            object.material = new THREE.MeshStandardMaterial({
                color: newColor,
                side: THREE.FrontSide
            });
            object.material.needsUpdate = true;

            // Сохраняем в userData
            object.userData.originalMaterial = object.material.clone();
            object.userData.currentColor = colorValue;
            return;
        }

        // Если объект выделен, обновляем и оригинальный материал
        if (object.userData.originalMaterial) {
            // Клонируем оригинальный материал, чтобы сохранить изменения
            const originalClone = object.userData.originalMaterial.clone();
            originalClone.color.copy(newColor);

            // Обновляем userData
            object.userData.originalMaterial = originalClone;
        } else {
            // Сохраняем текущий материал как оригинальный
            object.userData.originalMaterial = object.material.clone();
            object.userData.originalMaterial.color.copy(newColor);
        }

        // Меняем цвет текущего материала
        object.material.color.copy(newColor);
        object.material.needsUpdate = true;

        // Сохраняем новый цвет в userData
        object.userData.currentColor = colorValue;
    }

    setObjectOpacity(object, opacity) {
        if (!object) return;

        // Если у объекта нет материала, создаем его
        if (!object.material) {
            object.material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                side: THREE.FrontSide,
                transparent: opacity < 1.0,
                opacity: opacity
            });
            object.material.needsUpdate = true;

            // Сохраняем в userData
            object.userData.originalMaterial = object.material.clone();
            object.userData.currentOpacity = opacity;
            return;
        }

        // Если объект выделен, обновляем и оригинальный материал
        if (object.userData.originalMaterial) {
            // Клонируем оригинальный материал
            const originalClone = object.userData.originalMaterial.clone();
            originalClone.opacity = opacity;
            originalClone.transparent = opacity < 1.0;

            // Обновляем userData
            object.userData.originalMaterial = originalClone;
        } else {
            // Сохраняем текущий материал как оригинальный
            object.userData.originalMaterial = object.material.clone();
            object.userData.originalMaterial.opacity = opacity;
            object.userData.originalMaterial.transparent = opacity < 1.0;
        }

        // Меняем прозрачность текущего материала
        object.material.opacity = opacity;
        object.material.transparent = opacity < 1.0;
        object.material.needsUpdate = true;

        // Сохраняем новую прозрачность
        object.userData.currentOpacity = opacity;
    }

    // УДАЛЕНИЕ ОБЪЕКТОВ
    deleteObject(object) {
        if (!confirm('Удалить объект?')) return;

        if (object.parent) {
            object.parent.remove(object);
        }

        const objIndex = this.objects.indexOf(object);
        if (objIndex > -1) {
            this.objects.splice(objIndex, 1);
        }

        // Удаляем из соответствующих массивов
        if (object.userData.type === 'sketch_plane') {
            const planeIndex = this.sketchPlanes.indexOf(object);
            if (planeIndex > -1) {
                this.sketchPlanes.splice(planeIndex, 1);
            }
        } else if (object.userData.type === 'work_plane') {
            const planeIndex = this.workPlanes.indexOf(object);
            if (planeIndex > -1) {
                this.workPlanes.splice(planeIndex, 1);
            }
        }

        const selectedIndex = this.selectedObjects.indexOf(object);
        if (selectedIndex > -1) {
            this.selectedObjects.splice(selectedIndex, 1);
        }

        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();

        this.objectsManager.updateSceneStats();
        this.objectsManager.updateSceneList();
        this.updatePropertiesPanel();

        this.showStatus('Объект удален', 'info');
    }

    deleteSelected() {
        if (this.selectedObjects.length === 0) return;

        const deletedObjects = this.selectedObjects.map(obj => ({
            uuid: obj.uuid,
            data: obj.userData
        }));

        this.history.addAction({
            type: 'delete',
            objects: deletedObjects
        });

        this.selectedObjects.forEach(obj => {
            this.objectsGroup.remove(obj);
            const index = this.objects.indexOf(obj);
            if (index > -1) {
                this.objects.splice(index, 1);
            }

            // Удаляем из соответствующих массивов
            if (obj.userData.type === 'sketch_plane') {
                const planeIndex = this.sketchPlanes.indexOf(obj);
                if (planeIndex > -1) {
                    this.sketchPlanes.splice(planeIndex, 1);
                }
            } else if (obj.userData.type === 'work_plane') {
                const planeIndex = this.workPlanes.indexOf(obj);
                if (planeIndex > -1) {
                    this.workPlanes.splice(planeIndex, 1);
                }
            }

            obj.geometry.dispose();
            obj.material.dispose();
        });

        this.clearSelection();
        this.objectsManager.updateSceneStats();
        this.objectsManager.updateSceneList();
    }

    // ОПЕРАЦИИ С ОБЪЕКТАМИ
    centerSelected(axis) {
        if (this.selectedObjects.length === 0) return;

        this.selectedObjects.forEach(obj => {
            const box = new THREE.Box3().setFromObject(obj);
            const center = new THREE.Vector3();
            box.getCenter(center);

            switch(axis) {
                case 'x': obj.position.x = 0; break;
                case 'y': obj.position.y = 0; break;
                case 'z': obj.position.z = 0; break;
                case 'all': obj.position.set(0, 0, 0); break;
            }
        });

        this.updatePropertiesPanel();
        this.history.addAction({
            type: 'center',
            objects: this.selectedObjects.map(obj => obj.uuid),
            axis: axis
        });
    }

    extrudeSketch() {
        if (this.selectedObjects.length === 1 &&
            this.selectedObjects[0].userData.type === 'sketch') {
            this.startExtrudeMode();
        } else {
            this.showStatus('Выберите скетч для вытягивания', 'error');
        }
    }

    cutSketch() {
        this.showStatus('Вырезание скетча (в разработке)', 'info');
    }

    // ВИДЫ КАМЕРЫ
    setView(view) {
        const positions = {
            home: [100, 100, 100],
            isometric: [100, 100, 100],
            front: [0, 0, 100],    // Смотрим по оси Z (Y вверх)
            back: [0, 0, -100],
            top: [0, 100, 0],      // Смотрим сверху по оси Y
            bottom: [0, -100, 0],
            left: [-100, 0, 0],
            right: [100, 0, 0]
        };

        if (positions[view]) {
            this.camera.position.set(...positions[view]);
            this.camera.lookAt(0, 0, 0);
        }

        if (view === 'perspective') {
            this.camera.fov = 60;
        } else if (view === 'orthographic') {
            this.camera.fov = 20;
        }

        if (view === 'perspective' || view === 'orthographic') {
            this.camera.updateProjectionMatrix();
        }

        this.controls.update();
    }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        if (this.gridHelper) {
            this.gridHelper.visible = this.gridVisible;
        }
        this.showStatus(`Сетка: ${this.gridVisible ? 'вкл' : 'выкл'}`, 'info');
    }

    toggleAxes() {
        this.axesVisible = !this.axesVisible;
        if (this.axesHelper) {
            this.axesHelper.visible = this.axesVisible;
        }
        this.showStatus(`Оси: ${this.axesVisible ? 'вкл' : 'выкл'}`, 'info');
    }

    toggleWireframe() {
        if (this.selectedObjects.length > 0) {
            this.selectedObjects.forEach(obj => {
                if (obj.material.wireframe !== undefined) {
                    obj.material.wireframe = !obj.material.wireframe;
                }
            });
            this.showStatus('Режим каркаса переключен', 'info');
        }
    }

    // КЛАВИАТУРА
    onKeyDown(e) {
        const key = e.key.toLowerCase();

        switch (key) {
            case 'escape':
                // Сначала пробуем отменить перетаскивание
                if (this.dragManager && this.dragManager.handleEscape()) {
                    e.preventDefault();
                    break;
                }
                this.clearSelection();
                if (this.sketchMode) this.exitSketchMode();
                if (this.extrudeMode) this.extrudeManager.cancelExtrudeMode();
                if (this.workPlaneMode) this.planesManager.exitWorkPlaneMode();
                this.setCurrentTool('select');
                break;
            case 'g':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (this.dragManager) {
                    const snapped = this.dragManager.toggleSnapToGrid();
                    document.getElementById('toggleGrid').classList.toggle('active', snapped);
                }
            }
            break;
            case 'delete':
            case 'backspace':
                this.deleteSelected();
                break;
            case 'z':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.shiftKey ? this.redo() : this.undo();
                }
                break;
            case 'y':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.redo();
                }
                break;
            case 's':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.saveProject();
                }
                break;
            case 'n':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.newProject();
                }
                break;
            case 'r':
                if (e.altKey || e.shiftKey) {
                    this.setView('home');
                }
                break;
            case ' ':
                if (!this.spacePressed) {
                    this.spacePressed = true;
                    this.originalMouseButtons = { ...this.controls.mouseButtons };
                    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
                }
                break;
        }
    }

    onKeyUp(e) {
        if (e.key === ' ') {
            if (this.spacePressed && this.originalMouseButtons) {
                this.spacePressed = false;
                this.controls.mouseButtons = this.originalMouseButtons;
            }
        }
    }

    // БУЛЕВЫ ОПЕРАЦИИ
    performUnion() {
        // Проверяем инициализацию
        if (!this.booleanOps) {
            this.showStatus('Булевы операции не инициализированы. Попробуйте еще раз через секунду.', 'error');
            // Пробуем инициализировать снова
            this.initBooleanOperations();
            return;
        }

        if (this.selectedObjects.length < 2) {
            this.showStatus('Выберите минимум 2 объекта для объединения', 'error');
            return;
        }

        const check = this.booleanOps.canPerformOperation(this.selectedObjects);
        if (!check.can) {
            this.showStatus(check.reason, 'error');
            return;
        }

        if (check.warning && !confirm(`${check.reason}\nПродолжить операцию?`)) {
            return;
        }

        this.showLoadingIndicator('Выполняется объединение...');

        // Запускаем операцию асинхронно
        setTimeout(() => {
            try {
                const result = this.booleanOps.unionMultiple(this.selectedObjects);
                this.hideLoadingIndicator();

                if (result) {
                    this.addBooleanResult(result, 'union');
                } else {
                    this.showStatus('Операция не дала результата', 'error');
                }
            } catch (error) {
                this.hideLoadingIndicator();
                console.error('Union error:', error);
                this.showStatus(`Ошибка объединения: ${error.message}`, 'error');
            }
        }, 50);
    }

    // Аналогично обновите performSubtract() и performIntersect()
    performSubtract() {
        if (!this.booleanOps) {
            this.showStatus('Булевы операции не инициализированы. Попробуйте еще раз через секунду.', 'error');
            this.initBooleanOperations();
            return;
        }

        if (this.selectedObjects.length < 2) {
            this.showStatus('Выберите 2 объекта для вычитания', 'error');
            return;
        }

        const check = this.booleanOps.canPerformOperation(this.selectedObjects.slice(0, 2));
        if (!check.can) {
            this.showStatus(check.reason, 'error');
            return;
        }

        if (check.warning && !confirm(`${check.reason}\nПродолжить операцию?`)) {
            return;
        }

        this.showLoadingIndicator('Выполняется вычитание...');

        setTimeout(() => {
            try {
                const result = this.booleanOps.subtract(
                    this.selectedObjects[0],
                    this.selectedObjects[1]
                );
                this.hideLoadingIndicator();

                if (result) {
                    this.addBooleanResult(result, 'subtract');
                } else if (!result) {
                    this.showStatus('Операция не дала результата', 'error');
                }
            } catch (error) {
                this.hideLoadingIndicator();
                console.error('Subtract error:', error);
                this.showStatus(`Ошибка вычитания: ${error.message}`, 'error');
            }
        }, 50);
    }

    performIntersect() {
        if (!this.booleanOps) {
            this.showStatus('Булевы операции не инициализированы. Попробуйте еще раз через секунду.', 'error');
            this.initBooleanOperations();
            return;
        }

        if (this.selectedObjects.length < 2) {
            this.showStatus('Выберите 2 объекта для пересечения', 'error');
            return;
        }

        const check = this.booleanOps.canPerformOperation(this.selectedObjects.slice(0, 2));
        if (!check.can) {
            this.showStatus(check.reason, 'error');
            return;
        }

        if (check.warning && !confirm(`${check.reason}\nПродолжить операцию?`)) {
            return;
        }

        this.showLoadingIndicator('Выполняется пересечение...');

        setTimeout(() => {
            try {
                const result = this.booleanOps.intersect(
                    this.selectedObjects[0],
                    this.selectedObjects[1]
                );
                this.hideLoadingIndicator();

                if (result) {
                    this.addBooleanResult(result, 'intersect');
                } else if (!result) {
                    this.showStatus('Операция не дала результата', 'error');
                }
            } catch (error) {
                this.hideLoadingIndicator();
                console.error('Intersect error:', error);
                this.showStatus(`Ошибка пересечения: ${error.message}`, 'error');
            }
        }, 50);
    }

    validateBooleanResult(resultMesh) {
        if (!resultMesh || !resultMesh.geometry) {
            return false;
        }

        const vertices = resultMesh.geometry.attributes.position?.count || 0;
        return vertices > 0;
    }



    addBooleanResult(result, operation) {
        // Сохраняем копии исходных объектов перед удалением
        const originalObjects = this.selectedObjects.map(obj => {
            return {
                uuid: obj.uuid,
                data: this.projectManager.serializeObjectForHistory(obj)
            };
        });

        const sourceObjectIds = this.selectedObjects.map(obj => obj.uuid);
        const keepOriginal = document.getElementById('boolKeepOriginal') ?
            document.getElementById('boolKeepOriginal').checked : false;

        // Анимация результата
        result.userData.animation = {
            scale: { x: 0.1, y: 0.1, z: 0.1 },
            targetScale: { x: 1, y: 1, z: 1 }
        };

        this.objectsGroup.add(result);
        this.objects.push(result);

        result.scale.set(0.1, 0.1, 0.1);
        new TWEEN.Tween(result.scale)
            .to({ x: 1, y: 1, z: 1 }, 300)
            .easing(TWEEN.Easing.Elastic.Out)
            .start();

        if (!keepOriginal && this.selectedObjects.length > 0) {
            const objectsToRemove = [...this.selectedObjects];

            for (let obj of objectsToRemove) {
                if (obj.parent) {
                    obj.parent.remove(obj);
                } else {
                    this.objectsGroup.remove(obj);
                }

                    const index = this.objects.indexOf(obj);
                    if (index > -1) {
                        this.objects.splice(index, 1);

                        // Удаляем из специальных массивов
                        if (obj.userData.type === 'sketch_plane') {
                            this.sketchPlanes = this.sketchPlanes.filter(p => p.uuid !== obj.uuid);
                        } else if (obj.userData.type === 'work_plane') {
                            this.workPlanes = this.workPlanes.filter(p => p.uuid !== obj.uuid);
                        }
                    }
                }

                this.selectedObjects = [];
                this.objectsManager.updateSceneList();
            }

            this.selectObject(result);
            this.objectsManager.updateSceneStats();

            // Записываем в историю с сохранением исходных объектов
            this.history.addAction({
                type: 'boolean',
                operation: operation,
                result: result.uuid,
                sourceObjects: sourceObjectIds,
                originalObjects: originalObjects,
                data: this.projectManager.serializeObjectForHistory(result)
            });

            setTimeout(() => {
                const stats = this.booleanOps ? this.booleanOps.getOperationStats(result) : null;
                if (stats) {
                    this.showStatus(
                        `Операция "${operation}" завершена. Вершин: ${stats.vertices}, Полигонов: ${stats.faces}`,
                        'success'
                    );
                }
            }, 100);
        }

    showLoadingIndicator(message) {
        let indicator = document.getElementById('boolLoadingIndicator');

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'boolLoadingIndicator';
            indicator.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px 30px;
                border-radius: 8px;
                z-index: 10001;
                display: flex;
                align-items: center;
                gap: 15px;
                font-family: Arial, sans-serif;
            `;

            indicator.innerHTML = `
                <div class="spinner" style="
                    width: 24px;
                    height: 24px;
                    border: 3px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top-color: #fff;
                    animation: spin 1s linear infinite;
                "></div>
                <div class="message">${message}</div>
            `;

            document.body.appendChild(indicator);

            if (!document.querySelector('#boolLoadingStyles')) {
                const style = document.createElement('style');
                style.id = 'boolLoadingStyles';
                style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
                document.head.appendChild(style);
            }
        } else {
            indicator.querySelector('.message').textContent = message;
            indicator.style.display = 'flex';
        }
    }

    hideLoadingIndicator() {
        const indicator = document.getElementById('boolLoadingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // ПРОЕКТЫ (делегированные методы)
    newProject() {
        return this.projectManager.newProject();
    }

    showSaveModal() {
        return this.projectManager.showSaveModal();
    }

    saveProject() {
        return this.projectManager.saveProject();
    }

    openProject() {
        return this.projectManager.openProject();
    }

    loadProject(project) {
        return this.projectManager.loadProject(project);
    }

    loadSavedProjects() {
        return this.projectManager.loadSavedProjects();
    }

    showExportModal() {
        return this.projectManager.showExportModal();
    }

    exportModel() {
        return this.projectManager.exportModel();
    }

    exportJSON() {
        return this.projectManager.exportJSON();
    }

    exportSVG() {
        return this.projectManager.exportSVG();
    }

    // ИСТОРИЯ ДЕЙСТВИЙ
    undo() {
        const action = this.history.undo();
        if (action) {
            this.applyHistoryAction(action, true);
            this.showStatus('Отменено: ' + action.type, 'info');
        }
    }

    redo() {
        const action = this.history.redo();
        if (action) {
            this.applyHistoryAction(action, false);
            this.showStatus('Повторено: ' + action.type, 'info');
        }
    }

    // app.js - добавьте в applyHistoryAction()
    applyHistoryAction(action, isUndo) {
        if (!action) return;

        console.log('Applying history action:', action.type, isUndo ? 'undo' : 'redo');

        switch (action.type) {
            case 'create':
                if (isUndo) {
                    // Удаляем объект
                    const obj = this.findObjectByUuid(action.object);
                    if (obj) {
                        this.objectsGroup.remove(obj);
                        this.objects = this.objects.filter(o => o.uuid !== action.object);
                        this.selectedObjects = this.selectedObjects.filter(o => o.uuid !== action.object);

                        // Удаляем из специальных массивов
                        if (obj.userData.type === 'sketch_plane') {
                            this.sketchPlanes = this.sketchPlanes.filter(p => p.uuid !== action.object);
                        } else if (obj.userData.type === 'work_plane') {
                            this.workPlanes = this.workPlanes.filter(p => p.uuid !== action.object);
                        }

                        // Освобождаем ресурсы
                        if (obj.geometry) obj.geometry.dispose();
                        if (obj.material) obj.material.dispose();

                        this.objectsManager.updateSceneStats();
                        this.objectsManager.updateSceneList();
                    }
                } else {
                    // Восстанавливаем объект
                    if (action.data && this.projectManager) {
                        const objData = {
                            uuid: action.object,
                            userData: action.data,
                            position: action.data.position || [0, 0, 0],
                            rotation: action.data.rotation || [0, 0, 0],
                            scale: action.data.scale || [1, 1, 1]
                        };

                        const obj = this.projectManager.deserializeObjectOptimized(objData);
                        if (obj) {
                            this.objectsGroup.add(obj);
                            this.objects.push(obj);

                            if (obj.userData.type === 'sketch_plane') {
                                this.sketchPlanes.push(obj);
                            } else if (obj.userData.type === 'work_plane') {
                                this.workPlanes.push(obj);
                            }

                            this.objectsManager.updateSceneStats();
                            this.objectsManager.updateSceneList();
                        }
                    }
                }
                break;

            case 'delete':
                if (isUndo) {
                    // Восстанавливаем удаленные объекты
                    action.objects.forEach(objData => {
                        if (objData.data && this.projectManager) {
                            // Для STL и сложных объектов восстанавливаем из сохраненных данных
                            const fullData = {
                                uuid: objData.uuid,
                                userData: objData.data.userData,
                                position: objData.data.position || [0, 0, 0],
                                rotation: objData.data.rotation || [0, 0, 0],
                                scale: objData.data.scale || [1, 1, 1],
                                type: objData.data.type || 'object'
                            };

                            const obj = this.projectManager.deserializeObjectOptimized(fullData);
                            if (obj) {
                                this.objectsGroup.add(obj);
                                this.objects.push(obj);

                                if (obj.userData.type === 'sketch_plane') {
                                    this.sketchPlanes.push(obj);
                                } else if (obj.userData.type === 'work_plane') {
                                    this.workPlanes.push(obj);
                                }
                            }
                        }
                    });
                    this.objectsManager.updateSceneStats();
                    this.objectsManager.updateSceneList();
                } else {
                    // Снова удаляем объекты
                    action.objects.forEach(objData => {
                        const obj = this.findObjectByUuid(objData.uuid);
                        if (obj) {
                            this.objectsGroup.remove(obj);
                            this.objects = this.objects.filter(o => o.uuid !== objData.uuid);
                            this.selectedObjects = this.selectedObjects.filter(o => o.uuid !== objData.uuid);

                            if (obj.userData.type === 'sketch_plane') {
                                this.sketchPlanes = this.sketchPlanes.filter(p => p.uuid !== objData.uuid);
                            } else if (obj.userData.type === 'work_plane') {
                                this.workPlanes = this.workPlanes.filter(p => p.uuid !== objData.uuid);
                            }

                            if (obj.geometry) obj.geometry.dispose();
                            if (obj.material) obj.material.dispose();
                        }
                    });
                    this.objectsManager.updateSceneStats();
                    this.objectsManager.updateSceneList();
                }
                break;

            case 'modify_position':
                const posObj = this.findObjectByUuid(action.object);
                if (posObj) {
                    if (isUndo) {
                        posObj.position.fromArray(action.data.previousPosition || [0, 0, 0]);
                    } else {
                        posObj.position.fromArray(action.data.position || [0, 0, 0]);
                    }
                    this.updatePropertiesPanel();
                }
                break;

            case 'modify_scale':
                const scaleObj = this.findObjectByUuid(action.object);
                if (scaleObj) {
                    if (isUndo) {
                        scaleObj.scale.fromArray(action.data.previousScale || [1, 1, 1]);
                    } else {
                        scaleObj.scale.fromArray(action.data.scale || [1, 1, 1]);
                    }
                    this.updatePropertiesPanel();
                }
                break;

            case 'modify_rotation':
                const rotObj = this.findObjectByUuid(action.object);
                if (rotObj) {
                    if (isUndo) {
                        rotObj.rotation.fromArray(action.data.previousRotation || [0, 0, 0]);
                    } else {
                        rotObj.rotation.fromArray(action.data.rotation || [0, 0, 0]);
                    }
                    this.updatePropertiesPanel();
                }
                break;

            case 'modify_size':
                const sizeObj = this.findObjectByUuid(action.object);
                if (sizeObj && this.transformControls) {
                    if (isUndo) {
                        this.transformControls.updateObjectSizeDirect(sizeObj, action.data.previousDimensions);
                    } else {
                        this.transformControls.updateObjectSizeDirect(sizeObj, action.data.dimensions);
                    }
                    this.updatePropertiesPanel();
                    this.objectsManager.updateSceneStats();
                }
                break;

            case 'modify_color':
                const colorObj = this.findObjectByUuid(action.object);
                if (colorObj && colorObj.material) {
                    if (isUndo) {
                        this.setObjectColor(colorObj, action.data.previousColor);
                    } else {
                        this.setObjectColor(colorObj, action.data.color);
                    }
                    this.updatePropertiesPanel();
                }
                break;

            case 'modify_opacity':
                const opacityObj = this.findObjectByUuid(action.object);
                if (opacityObj && opacityObj.material) {
                    if (isUndo) {
                        this.setObjectOpacity(opacityObj, action.data.previousOpacity);
                    } else {
                        this.setObjectOpacity(opacityObj, action.data.opacity);
                    }
                    this.updatePropertiesPanel();
                }
                break;

            case 'boolean':
                console.log('Boolean action:', action.operation, isUndo ? 'undo' : 'redo');

                if (isUndo) {
                    // Удаляем результат булевой операции
                    const resultObj = this.findObjectByUuid(action.result);
                    if (resultObj) {
                        this.objectsGroup.remove(resultObj);
                        this.objects = this.objects.filter(o => o.uuid !== action.result);
                        this.selectedObjects = this.selectedObjects.filter(o => o.uuid !== action.result);

                        if (resultObj.geometry) resultObj.geometry.dispose();
                        if (resultObj.material) resultObj.material.dispose();
                    }

                    // Восстанавливаем исходные объекты из originalObjects
                    if (action.originalObjects && action.originalObjects.length > 0) {
                        action.originalObjects.forEach(objData => {
                            if (objData && objData.data && this.projectManager) {
                                const fullData = {
                                    uuid: objData.uuid,
                                    userData: objData.data.userData || {},
                                    position: objData.data.position || [0, 0, 0],
                                    rotation: objData.data.rotation || [0, 0, 0],
                                    scale: objData.data.scale || [1, 1, 1],
                                    type: objData.data.type || 'object'
                                };

                                const restoredObj = this.projectManager.deserializeObjectOptimized(fullData);
                                if (restoredObj) {
                                    this.objectsGroup.add(restoredObj);
                                    this.objects.push(restoredObj);

                                    // Восстанавливаем специальные массивы
                                    if (restoredObj.userData.type === 'sketch_plane') {
                                        this.sketchPlanes.push(restoredObj);
                                    } else if (restoredObj.userData.type === 'work_plane') {
                                        this.workPlanes.push(restoredObj);
                                    }
                                }
                            }
                        });
                    }
                } else {
                    // Redo: снова удаляем исходные объекты
                    if (action.sourceObjects && action.sourceObjects.length > 0) {
                        action.sourceObjects.forEach(sourceUuid => {
                            const sourceObj = this.findObjectByUuid(sourceUuid);
                            if (sourceObj) {
                                this.objectsGroup.remove(sourceObj);
                                this.objects = this.objects.filter(o => o.uuid !== sourceUuid);
                                this.selectedObjects = this.selectedObjects.filter(o => o.uuid !== sourceUuid);

                                // Удаляем из специальных массивов
                                if (sourceObj.userData.type === 'sketch_plane') {
                                    this.sketchPlanes = this.sketchPlanes.filter(p => p.uuid !== sourceUuid);
                                } else if (sourceObj.userData.type === 'work_plane') {
                                    this.workPlanes = this.workPlanes.filter(p => p.uuid !== sourceUuid);
                                }

                                if (sourceObj.geometry) sourceObj.geometry.dispose();
                                if (sourceObj.material) sourceObj.material.dispose();
                            }
                        });
                    }

                    // Создаем результат булевой операции
                    const resultObj = this.findObjectByUuid(action.result);
                    if (!resultObj && action.data && this.projectManager) {
                        const resultData = {
                            uuid: action.result,
                            userData: action.data.userData || {},
                            position: action.data.position || [0, 0, 0],
                            rotation: action.data.rotation || [0, 0, 0],
                            scale: action.data.scale || [1, 1, 1],
                            type: action.data.type || 'boolean_result'
                        };

                        const newResult = this.projectManager.deserializeObjectOptimized(resultData);
                        if (newResult) {
                            this.objectsGroup.add(newResult);
                            this.objects.push(newResult);
                            this.selectObject(newResult);
                        }
                    } else if (resultObj) {
                        // Если объект уже существует, но не в сцене
                        if (!resultObj.parent) {
                            this.objectsGroup.add(resultObj);
                            this.objects.push(resultObj);
                        }
                        this.selectObject(resultObj);
                    }
                }

                this.objectsManager.updateSceneStats();
                this.objectsManager.updateSceneList();
                break;

            case 'import':
                if (isUndo) {
                    const importedObj = this.findObjectByUuid(action.object);
                    if (importedObj) {
                        this.objectsGroup.remove(importedObj);
                        this.objects = this.objects.filter(o => o.uuid !== action.object);
                        this.selectedObjects = this.selectedObjects.filter(o => o.uuid !== action.object);

                        if (importedObj.geometry) importedObj.geometry.dispose();
                        if (importedObj.material) importedObj.material.dispose();

                        this.objectsManager.updateSceneStats();
                        this.objectsManager.updateSceneList();
                    }
                } else {
                    // Повторно импортируем объект (нужно реализовать, если требуется)
                    this.showStatus('Повторный импорт не реализован', 'warning');
                }
                break;

            default:
                console.warn('Unknown action type:', action.type);
        }
    }

    // ОСНОВНОЙ ЦИКЛ
    animate() {
        requestAnimationFrame(() => this.animate());

        TWEEN.update();
        this.controls.update();

        if (this.transformControls) {
            this.transformControls.update();
        }

        this.renderer.render(this.scene, this.camera);
        this.updateFPS();
    }

    updateFPS() {
        const now = performance.now();
        const delta = now - this.lastTime;
        this.frames++;

        if (delta >= 1000) {
            this.fps = Math.round((this.frames * 1000) / delta);
            document.getElementById('fpsCounter').textContent = `FPS: ${this.fps}`;
            this.frames = 0;
            this.lastTime = now;
        }
    }

    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    onWindowResize() {
        const viewport = document.getElementById('viewport');
        const width = viewport.parentElement.clientWidth;
        const height = viewport.parentElement.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    showStatus(message, type = 'info') {
        const status = document.getElementById('status');
        status.textContent = message;

        const colors = {
            success: '#00c853',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196f3'
        };

        status.style.background = colors[type] || '#2196f3';

        setTimeout(() => {
            status.textContent = 'Готов';
            status.style.background = '#00c853';
        }, 3000);
    }

    updatePropertiesPanel() {
        const propertiesContent = document.getElementById('propertiesContent');
        if (!propertiesContent) return;

        // Всегда показываем группу центрирования если есть выделение
        const centerGroup = document.querySelector('.property-group[data-type="center"]');

        if (this.selectedObjects.length > 0 && centerGroup) {
            centerGroup.style.display = 'block';
        } else if (centerGroup) {
            centerGroup.style.display = 'none';
        }

        if (this.selectedObjects.length === 1) {
            const obj = this.selectedObjects[0];

            // Позиция
            document.getElementById('posX').value = obj.position.x.toFixed(1);
            document.getElementById('posY').value = obj.position.y.toFixed(1);
            document.getElementById('posZ').value = obj.position.z.toFixed(1);

            // Вращение
            const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, 'XYZ');
            document.getElementById('rotX').value = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
            document.getElementById('rotY').value = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
            document.getElementById('rotZ').value = THREE.MathUtils.radToDeg(euler.z).toFixed(1);

            // Размеры
            const dimensions = this.objectsManager.getObjectDimensions(obj);
            document.getElementById('sizeXInput').value = dimensions.x.toFixed(1);
            document.getElementById('sizeYInput').value = dimensions.y.toFixed(1);
            document.getElementById('sizeZInput').value = dimensions.z.toFixed(1);

            // Внешний вид - ТОЛЬКО ЕСЛИ ОБЪЕКТ ИМЕЕТ МАТЕРИАЛ
            if (obj.material) {
                const color = new THREE.Color(obj.material.color);
                document.getElementById('objectColor').value = color.getStyle();
                document.getElementById('objectOpacity').value = obj.material.opacity;
                document.getElementById('objectColor').disabled = false;
                document.getElementById('objectOpacity').disabled = false;
            } else {
                // Если объект не имеет материала, отключаем поля
                document.getElementById('objectColor').value = '#ffffff';
                document.getElementById('objectOpacity').value = 1.0;
                document.getElementById('objectColor').disabled = true;
                document.getElementById('objectOpacity').disabled = true;
            }

            // Показываем все группы свойств для единичного выделения
            document.querySelectorAll('.property-group').forEach(group => {
                if (group.dataset.type !== 'center') { // кроме центрирования, которое уже показано
                    group.style.display = 'block';
                }
            });

            this.enablePropertyFields(true);
        } else {
            // Скрываем все группы кроме центрирования
            document.querySelectorAll('.property-group').forEach(group => {
                if (group.dataset.type !== 'center') {
                    group.style.display = 'none';
                }
            });

            // Для множественного выделения показываем только центрирование
            if (this.selectedObjects.length > 1) {
                // Обновляем информацию о множественном выделении
                document.querySelectorAll('.property-group').forEach(group => {
                    if (group.dataset.type === 'center') {
                        // Можно добавить специальное сообщение для множественного выделения
                        const title = group.querySelector('h4');
                        if (title) {
                            title.innerHTML = `<i class="fas fa-bullseye"></i> Центрирование (${this.selectedObjects.length} объектов)`;
                        }
                    }
                });
            }

            this.enablePropertyFields(false);
        }
    }


    enablePropertyFields(enabled) {
        const fields = [
            'posX', 'posY', 'posZ',
            'rotX', 'rotY', 'rotZ',
            'sizeXInput', 'sizeYInput', 'sizeZInput',
            'objectColor', 'objectOpacity'
        ];

        fields.forEach(id => {
            const field = document.getElementById(id);
            if (field) {
                // Поля доступны только если есть ровно один выделенный объект
                field.disabled = !enabled || this.selectedObjects.length !== 1;

                // Дополнительно для цветных полей проверяем наличие материала
                if (id === 'objectColor' || id === 'objectOpacity') {
                    if (this.selectedObjects.length === 1 && this.selectedObjects[0].material) {
                        field.disabled = false;
                    } else {
                        field.disabled = true;
                    }
                }
            }
        });

        // Кнопка применения размеров доступна только при выделении одного объекта
        const applyButton = document.getElementById('applySize');
        if (applyButton) {
            applyButton.disabled = !enabled || this.selectedObjects.length !== 1;
        }

        // Кнопки центрирования всегда доступны если есть выделение
        const centerButtons = ['centerX', 'centerY', 'centerZ', 'centerAll'];
        centerButtons.forEach(id => {
            const button = document.getElementById(id);
            if (button) {
                button.disabled = this.selectedObjects.length === 0;
            }
        });
    }

    updateStatus() {
        const modeNames = {
            select: 'Выделение',
            move: 'Перемещение',
            rotate: 'Вращение',
            scale: 'Масштабирование',
            sketch: 'Скетч',
            extrude: 'Вытягивание'
        };

        const modeText = modeNames[this.currentTool] || this.currentTool;
        document.getElementById('modeIndicator').innerHTML =
            `<i class="fas fa-mouse-pointer"></i> Режим: ${modeText}`;
        document.getElementById('selectedInfo').textContent =
            `Выбрано: ${this.selectedObjects.length}`;

        this.updateToolButtons();
    }

    updateToolButtons() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tool === this.currentTool) {
                btn.classList.add('active');
            }
        });
    }

    applySizeFromInputs() {
        if (this.selectedObjects.length !== 1) return;

        const obj = this.selectedObjects[0];
        const sizeX = parseFloat(document.getElementById('sizeXInput').value);
        const sizeY = parseFloat(document.getElementById('sizeYInput').value);
        const sizeZ = parseFloat(document.getElementById('sizeZInput').value);

        if (isNaN(sizeX) || isNaN(sizeY) || isNaN(sizeZ) ||
            sizeX < 1 || sizeY < 1 || sizeZ < 1) {
            this.showStatus('Некорректные значения размеров', 'error');
            return;
        }

        // Округляем до целых миллиметров
        const newDimensions = {
            x: Math.round(sizeX),
            y: Math.round(sizeY),
            z: Math.round(sizeZ)
        };

        // Обновляем значения в полях ввода
        document.getElementById('sizeXInput').value = newDimensions.x;
        document.getElementById('sizeYInput').value = newDimensions.y;
        document.getElementById('sizeZInput').value = newDimensions.z;

        // Применяем изменения через TransformControls
        if (this.transformControls) {
            // Если гизмо прикреплено к объекту, используем его метод
            if (this.transformControls.attachedObject === obj) {
                this.transformControls.updateObjectSize(obj, newDimensions);
            } else {
                // Иначе используем прямой метод
                this.transformControls.updateObjectSizeDirect(obj, newDimensions);
            }
        }

        // Добавляем в историю
        this.history.addAction({
            type: 'modify_size',
            object: obj.uuid,
            data: {
                dimensions: newDimensions,
                originalDimensions: this.objectsManager.getObjectDimensions(obj)
            }
        });

        this.showStatus(`Размеры установлены: ${newDimensions.x}x${newDimensions.y}x${newDimensions.z} мм`, 'success');
        this.objectsManager.updateSceneStats();
    }

    updateCoordinates(event) {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Плоскость Y=0 для отображения координат
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(plane, intersection)) {
            document.getElementById('coords').textContent =
                `X: ${intersection.x.toFixed(2)}, Y: ${intersection.y.toFixed(2)}, Z: ${intersection.z.toFixed(2)}`;
        }
    }

    // Метод для истории (должен быть доступен из HistoryManager)
    findObjectByUuid(uuid) {
        return this.objects.find(obj => obj.uuid === uuid) || null;
    }
}

// Инициализация редактора
window.addEventListener('DOMContentLoaded', () => {
    window.cadEditor = new CADEditor();
});