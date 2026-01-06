// app.js
class CADEditor {
    constructor() {
        // Константы версии
        this.APP_VERSION = '0.6.0';
        this.APP_NAME = 'КонтрБагCAD';
        this.APP_AUTHOR = 'Лунев Валерий Константинович ';

        // Основные свойства
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.objects = [];
        this.selectedObjects = [];
       // this.currentTool = 'select';

        // Плоскости
        this.workPlanes = [];
        this.sketchPlanes = [];
        this.basePlanes = null;

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
        this.toolManager = null;
        this.transformControls = null;
        this.booleanOps = null;
        this.libraryManager = null;
        this.dragManager = null;

        // Менеджеры объектов и проектов
        this.objectsManager = null;
        this.planesManager = null;
        this.extrudeManager = null;
        this.projectManager = null;

        // Инструменты (теперь создаются через toolManager)
      //  this.sketchTools = null;
        this.sketchManager = null;
        this.gearGenerator = null;
        this.rulerTool = null;
        this.threadGenerator = null;

        // Параметры
        this.mmScale = 1;
        this.pendingPrimitive = null;

        // Производительность
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
        this.initFileDrop();
        this.planesManager.createBasePlanes();
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
        this.history = new HistoryManager(this);
        this.storage = new StorageManager();
        this.transformControls = new TransformControls(this);

        // Менеджеры объектов и операций
        this.objectsManager = new ObjectsManager(this);
        this.planesManager = new PlanesManager(this);
        this.extrudeManager = new ExtrudeManager(this);
        this.projectManager = new ProjectManager(this);
        this.libraryManager = new LibraryManager(this);
        this.dragManager = new DragManager(this);

        // Менеджер инструментов
        this.toolManager = new ToolManager(this);

        // Инициализируем инструменты
        this.initTools();

        // Булевы операции (асинхронная загрузка)
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

    initTools() {
        // Инициализируем инструменты скетча (должны быть созданы до регистрации SketchTool)

        // Вместо: this.sketchTools = new SketchTools(this);
        this.sketchManager = new SketchManager(this);

        // Инициализируем генераторы
        this.gearGenerator = new GearGenerator(this);
        this.threadGenerator = new ThreadGenerator(this);

        // Регистрируем инструменты
        this.toolManager.registerTool('select', new SelectTool(this));
        this.toolManager.registerTool('move', new MoveTool(this));
        this.toolManager.registerTool('rotate', new RotateTool(this));
        this.toolManager.registerTool('scale', new ScaleTool(this));
        this.toolManager.registerTool('sketch', new SketchTool(this));
        this.toolManager.registerTool('extrude', new ExtrudeTool(this));
        this.toolManager.registerTool('workplane', new WorkPlaneTool(this));
        this.toolManager.registerTool('rulerTool', new RulerTool(this));
        this.toolManager.registerTool('gearGenerator', new GearTool(this));
        this.toolManager.registerTool('threadGenerator', new ThreadTool(this));

        // Булевы операции
        this.toolManager.registerTool('boolean-union', new BooleanUnionTool(this));
        this.toolManager.registerTool('boolean-subtract', new BooleanSubtractTool(this));
        this.toolManager.registerTool('boolean-intersect', new BooleanIntersectTool(this));

        // Устанавливаем инструмент по умолчанию
        this.toolManager.setCurrentTool('select');
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

    initHelpers() {
        this.gridHelper = new THREE.GridHelper(500, 100, 0x444444);
        this.gridHelper.position.y = 0;
        this.gridHelper.visible = this.gridVisible;
        this.worldGroup.add(this.gridHelper);

        this.axesHelper = new THREE.AxesHelper(50);
        this.axesHelper.visible = this.axesVisible;
        this.worldGroup.add(this.axesHelper);

        if (this.gridHelper) {
            const savedGridColor = localStorage.getItem('cad-grid-color');
            if (savedGridColor) {
                this.gridHelper.material.color.set(new THREE.Color(savedGridColor));
            }
        }
    }

    initUI() {
        // История
        document.getElementById('undo').addEventListener('click', () => this.undo());
        document.getElementById('redo').addEventListener('click', () => this.redo());
        document.getElementById('deleteObject').addEventListener('click', () => this.deleteSelected());

        // Устанавливаем номер версии
        document.getElementById('version').innerHTML = `<strong>Версия:</strong> ${this.APP_VERSION}`;

        // Обновляем статистику сцены
        this.objectsManager.updateSceneStats();
    }

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
    }

    // ФАЙЛОВЫЕ ОПЕРАЦИИ
    initFileOperations() {
        document.getElementById('newProject').addEventListener('click', () => this.newProject());
        document.getElementById('openProject').addEventListener('click', () => this.openProject());
        document.getElementById('saveProject').addEventListener('click', () => this.showSaveModal());
        document.getElementById('exportSTL').addEventListener('click', () => this.showExportModal());
        document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
        document.getElementById('exportSVG').addEventListener('click', () => this.exportSVG());
        document.getElementById('openSTL').addEventListener('click', () => this.projectManager.openSTL());
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
                    const position = this.libraryManager.getDropPosition(e);
                    this.libraryManager.addCustomSTLModel(file, position);
                }
            }
        });
    }

    // ВИДЫ И ОТОБРАЖЕНИЕ
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

    // СКЕТЧ-ИНСТРУМЕНТЫ (теперь делегируются SketchTool)
    initSketchTools() {
        document.getElementById('openSketch').addEventListener('click', () => {
            this.toolManager.setCurrentTool('sketch');
        });

        document.getElementById('createSketchPlane').addEventListener('click', () => {
            this.toolManager.setCurrentTool('workplane');
        });

        document.getElementById('extrudeSketch').addEventListener('click', () => {
            this.toolManager.setCurrentTool('extrude');
        });

        document.querySelectorAll('.sketch-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.sketchTool;
                if (this.sketchManager) {
                    this.sketchManager.setCurrentTool(tool);
                }
            });
        });

        document.getElementById('sketchDeleteBtn').addEventListener('click', () => {
            if (this.sketchManager) this.sketchManager.deleteSelected();
        });

        document.getElementById('sketchClearBtn').addEventListener('click', () => {
            if (this.sketchManager) this.sketchManager.clearSketch();
        });

        document.getElementById('exitSketchBtn').addEventListener('click', () => {
            if (this.sketchManager) {
                const sketchTool = this.toolManager.getTool('sketch');
                if (sketchTool) {
                    sketchTool.exitSketchMode();
                }
            }
        });

        document.getElementById('toggleSketchGrid').addEventListener('click', () => {
            if (this.sketchManager) {
                this.sketchManager.toggleGrid();
                this.showStatus(`Сетка скетча: ${this.sketchManager.gridVisible ? 'вкл' : 'выкл'}`, 'info');
            }
        });
    }

    // БУЛЕВЫ ОПЕРАЦИИ
    initBooleanOperations() {
        document.getElementById('booleanUnion').addEventListener('click', () => {
            this.toolManager.setCurrentTool('boolean-union');
        });

        document.getElementById('booleanSubtract').addEventListener('click', () => {
            this.toolManager.setCurrentTool('boolean-subtract');
        });

        document.getElementById('booleanIntersect').addEventListener('click', () => {
            this.toolManager.setCurrentTool('boolean-intersect');
        });
    }

    // МОДАЛЬНЫЕ ОКНА
    initModalHandlers() {
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                if (modal) modal.classList.remove('active');
            });
        });

        document.getElementById('aboutBtn').addEventListener('click', () => {
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

    // ПАНЕЛИ И СВОЙСТВА
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


        if (extrudeSketchBtn) extrudeSketchBtn.addEventListener('click', () => {
            this.toolManager.setCurrentTool('extrude');
        });
    }

    // ТЕМА И ОКРУЖЕНИЕ
    initThemeControls() {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = btn.dataset.theme;
                this.setTheme(theme);

                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        const savedTheme = localStorage.getItem('cad-theme') || 'dark';
        this.setTheme(savedTheme);

        const activeBtn = document.querySelector(`.theme-btn[data-theme="${savedTheme}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    initEnvironmentControls() {
        const bgColorPicker = document.getElementById('backgroundColor');
        if (bgColorPicker) {
            bgColorPicker.addEventListener('change', (e) => {
                this.renderer.setClearColor(new THREE.Color(e.target.value));
                localStorage.setItem('cad-bg-color', e.target.value);
            });

            const savedBgColor = localStorage.getItem('cad-bg-color') || '#1a1a1a';
            bgColorPicker.value = savedBgColor;
            this.renderer.setClearColor(new THREE.Color(savedBgColor));
        }

        const gridColorPicker = document.getElementById('gridColor');
        if (gridColorPicker && this.gridHelper) {
            gridColorPicker.addEventListener('change', (e) => {
                this.gridHelper.material.color.set(new THREE.Color(e.target.value));
                localStorage.setItem('cad-grid-color', e.target.value);
            });

            const savedGridColor = localStorage.getItem('cad-grid-color') || '#444444';
            gridColorPicker.value = savedGridColor;
            if (this.gridHelper) {
                this.gridHelper.material.color.set(new THREE.Color(savedGridColor));
            }
        }

        const resetBtn = document.getElementById('resetEnvironment');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetEnvironment();
            });
        }
    }

    setTheme(theme) {
        const body = document.body;
        body.classList.add('theme-transition');

        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            body.classList.remove('dark-theme', 'light-theme');
            body.classList.add(prefersDark ? 'dark-theme' : 'light-theme');
        } else {
            body.classList.remove('dark-theme', 'light-theme');
            body.classList.add(`${theme}-theme`);
        }

        localStorage.setItem('cad-theme', theme);

        const themeIcon = document.querySelector('.theme-controls .fa-sun, .theme-controls .fa-moon');
        if (themeIcon) {
            if (theme === 'light' || (theme === 'auto' && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                themeIcon.className = 'fas fa-sun';
            } else {
                themeIcon.className = 'fas fa-moon';
            }
        }

        setTimeout(() => {
            body.classList.remove('theme-transition');
        }, 300);
    }

    resetEnvironment() {
        localStorage.removeItem('cad-bg-color');
        localStorage.removeItem('cad-grid-color');

        this.renderer.setClearColor(0x1a1a1a, 1);
        document.getElementById('backgroundColor').value = '#1a1a1a';

        if (this.gridHelper) {
            this.gridHelper.material.color.set(0x444444);
        }
        document.getElementById('gridColor').value = '#444444';

        this.showStatus('Настройки окружения сброшены', 'info');
    }

    // ОБРАБОТКА МЫШИ
    initMouseHandlers() {
        const canvas = this.renderer.domElement;
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    }

    initKeyboardHandlers() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    handleMouseDown(e) {
        const isLeftClick = e.button === 0;
        const isRightClick = e.button === 2;
        const isMiddleClick = e.button === 1;

        if (isLeftClick) {
            e.preventDefault();
            this.updateMousePosition(e);

            // Делегируем обработку менеджеру инструментов
            if (this.toolManager.handleMouseDown(e)) {
                return;
            }

            // Стандартная обработка мыши (выделение)
            this.handleStandardMouseDown(e);
        }

        if (isRightClick) document.body.style.cursor = 'grab';
        if (isMiddleClick) document.body.style.cursor = 'move';
    }

    handleMouseMove(e) {
        this.updateMousePosition(e);
        this.updateCoordinates(e);

        // Делегируем обработку менеджеру инструментов
        this.toolManager.handleMouseMove(e);
    }

    handleMouseUp(e) {
        const isRightClick = e.button === 2;
        const isMiddleClick = e.button === 1;

        if (isRightClick || isMiddleClick) {
            document.body.style.cursor = 'default';
        }

        if (e.button === 0) {
            // Делегируем обработку менеджеру инструментов
            this.toolManager.handleMouseUp(e);
        }
    }



    handleDoubleClick(e) {
        // Делегируем обработку менеджеру инструментов
        if (this.toolManager.handleDoubleClick(e)) {
            return;
        }

        // Стандартная обработка двойного клика
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
                const hasSketchElements = this.objectsManager.checkPlaneForSketchElements(object);

                if (hasSketchElements) {
                    // Редактируем существующий скетч
                    this.selectSingleObject(object);
                    const sketchTool = this.toolManager.getTool('sketch');
                    if (sketchTool) {
                        sketchTool.editExistingSketch(object);
                    }
                    return;
                }
            }
        }
    }

    updateMousePosition(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    // СТАНДАРТНАЯ ОБРАБОТКА МЫШИ (выделение)
    handleStandardMouseDown(e) {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.objectsGroup.children, true);

        if (intersects.length > 0) {
            const object = this.objectsManager.findTopParent(intersects[0].object);

            if (e.ctrlKey || e.metaKey) {
                // При Ctrl+клике добавляем/удаляем объект из выделения
                this.toggleObjectSelection(object);
            } else {
                // Обычный клик - выделяем один объект
                this.selectSingleObject(object);
            }

            this.updatePropertiesPanel();
            this.updateStatus();
        } else {
            // Кликнули вне объекта - сбрасываем выделение
            this.clearSelection();
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

        this.updatePropertiesPanel();
        this.objectsManager.updateSceneList();
        this.updateStatus();
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

      //  this.setCurrentTool('select');
        this.updatePropertiesPanel();
        this.updateStatus();
    }

    activateTransformForSelected(object) {
        if (!object || !this.transformControls) return;

        const mode = this.toolManager.currentTool === 'move' ? 'translate' :
                    this.toolManager.currentTool === 'scale' ? 'scale' : 'rotate';

        // Сохраняем текущее состояние для истории
        if (!object.userData.lastPosition) {
            object.userData.lastPosition = object.position.toArray();
        }
        if (!object.userData.lastRotation) {
            object.userData.lastRotation = [object.rotation.x, object.rotation.y, object.rotation.z];
        }
        if (!object.userData.lastScale) {
            object.userData.lastScale = object.scale.toArray();
        }

        // Прикрепляем gizmo
        this.transformControls.attach(object);
        this.transformControls.updateMode(mode);
        this.transformControls.show();
    }

    // ИНСТРУМЕНТЫ
    setCurrentTool(tool) {
        this.toolManager.setCurrentTool(tool);
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

            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
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

    // ВИДЫ КАМЕРЫ
    setView(view) {
        const positions = {
            home: [100, 100, 100],
            isometric: [100, 100, 100],
            front: [0, 0, 100],
            back: [0, 0, -100],
            top: [0, 100, 0],
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

    focusCameraOnObject(object) {
        if (this.objectsManager && object) {
            this.objectsManager.focusCameraOnObject(object);
        }
    }

    // КЛАВИАТУРА
    onKeyDown(e) {
        // Даем обработать текущему инструменту
        if (this.toolManager.handleKeyDown(e)) {
            return;
        }

        const key = e.key.toLowerCase();

        switch (key) {
            case 'delete':
            case 'backspace':
                this.deleteSelected();
                break;
            case 'z':
            case 'я':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.shiftKey ? this.redo() : this.undo();
                }
                break;
            case 'y':
            case 'н':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.redo();
                }
                break;
            case 's':
            case 'ы':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.saveProject();
                }
                break;
            case 'n':
            case 'т':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.newProject();
                }
                break;
            case 'к':
            case 'r':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.newProject();
                } else if (e.altKey || e.shiftKey) {
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
            case 'п':
            case 'g':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (this.dragManager) {
                        const snapped = this.dragManager.toggleSnapToGrid();
                        document.getElementById('toggleGrid').classList.toggle('active', snapped);
                    }
                    if (this.sketchManager ) {
                            this.sketchManager.snapEnabled = !this.sketchManager.snapEnabled;
                        }
                }
                break;
        }
    }

    onKeyUp(e) {
        this.toolManager.handleKeyUp(e);

        if (e.key === ' ') {
            if (this.spacePressed && this.originalMouseButtons) {
                this.spacePressed = false;
                this.controls.mouseButtons = this.originalMouseButtons;
            }
        }
    }

    // БУЛЕВЫ ОПЕРАЦИИ (вызываются из BooleanTool)
    performUnion() {
        return this.booleanOps ? this.booleanOps.unionMultiple(this.selectedObjects) : null;
    }

    performSubtract() {
        if (!this.booleanOps || this.selectedObjects.length < 2) return null;
        return this.booleanOps.subtract(this.selectedObjects[0], this.selectedObjects[1]);
    }

    performIntersect() {
        if (!this.booleanOps || this.selectedObjects.length < 2) return null;
        return this.booleanOps.intersect(this.selectedObjects[0], this.selectedObjects[1]);
    }

    addBooleanResult(result, operation) {
        console.log('=== addBooleanResult ===');
        console.log('Operation:', operation);
        console.log('Selected objects:', this.selectedObjects.length);

        const originalObjects = [];

        this.selectedObjects.forEach((obj, index) => {
            console.log(`Processing object ${index}:`, obj.userData?.type, obj.uuid);

            try {
                const serialized = this.projectManager.serializeObjectForHistory(obj);
                console.log(`Serialized object ${index}:`, serialized);

                if (serialized) {
                    originalObjects.push({
                        uuid: obj.uuid,
                        data: serialized
                    });
                } else {
                    console.error(`Failed to serialize object ${index}`);
                }
            } catch (error) {
                console.error(`Error serializing object ${index}:`, error);
            }
        });

        console.log('Original objects to save:', originalObjects);

        const sourceObjectIds = this.selectedObjects.map(obj => obj.uuid);

        if (!result || !result.geometry) {
            this.showStatus('Ошибка: недопустимый результат булевой операции', 'error');
            return;
        }

        this.objectsGroup.add(result);
        this.objects.push(result);

        const objectsToRemove = [...this.selectedObjects];
        for (let obj of objectsToRemove) {
            this.objectsGroup.remove(obj);
            const index = this.objects.indexOf(obj);
            if (index > -1) {
                this.objects.splice(index, 1);
            }

            if (obj.userData?.type === 'sketch_plane') {
                const planeIndex = this.sketchPlanes.indexOf(obj);
                if (planeIndex > -1) {
                    this.sketchPlanes.splice(planeIndex, 1);
                }
            } else if (obj.userData?.type === 'work_plane') {
                const planeIndex = this.workPlanes.indexOf(obj);
                if (planeIndex > -1) {
                    this.workPlanes.splice(planeIndex, 1);
                }
            }
        }

        this.selectedObjects = [];
        this.objectsManager.updateSceneList();

        this.selectObject(result);
        this.objectsManager.updateSceneStats();

        const resultData = this.projectManager.serializeObjectForHistory(result);
        console.log('Result data:', resultData);

        const historyAction = {
            type: 'boolean',
            operation: operation,
            result: result.uuid,
            sourceObjects: sourceObjectIds,
            originalObjects: originalObjects,
            resultData: resultData
        };

        console.log('Adding to history:', historyAction);
        this.history.addAction(historyAction);

        this.showStatus(`Операция "${operation}" завершена`, 'success');
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
        if (this.history) {
            const success = this.history.undo();
            if (success) {
                this.showStatus('Отменено', 'info');
            }
        }
    }

    redo() {
        if (this.history) {
            const success = this.history.redo();
            if (success) {
                this.showStatus('Повторено', 'info');
            }
        }
    }

//    applyHistoryAction(action, isUndo) {
//
//    }

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

        const centerGroup = document.querySelector('.property-group[data-type="center"]');

        if (this.selectedObjects.length > 0 && centerGroup) {
            centerGroup.style.display = 'block';
        } else if (centerGroup) {
            centerGroup.style.display = 'none';
        }

        if (this.selectedObjects.length === 1) {
            const obj = this.selectedObjects[0];

            document.getElementById('posX').value = obj.position.x.toFixed(1);
            document.getElementById('posY').value = obj.position.y.toFixed(1);
            document.getElementById('posZ').value = obj.position.z.toFixed(1);

            const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, 'XYZ');
            document.getElementById('rotX').value = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
            document.getElementById('rotY').value = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
            document.getElementById('rotZ').value = THREE.MathUtils.radToDeg(euler.z).toFixed(1);

            const dimensions = this.objectsManager.getObjectDimensions(obj);
            document.getElementById('sizeXInput').value = dimensions.x.toFixed(1);
            document.getElementById('sizeYInput').value = dimensions.y.toFixed(1);
            document.getElementById('sizeZInput').value = dimensions.z.toFixed(1);

            if (obj.material) {
                const color = new THREE.Color(obj.material.color);
                document.getElementById('objectColor').value = color.getStyle();
                document.getElementById('objectOpacity').value = obj.material.opacity;
                document.getElementById('objectColor').disabled = false;
                document.getElementById('objectOpacity').disabled = false;
            } else {
                document.getElementById('objectColor').value = '#ffffff';
                document.getElementById('objectOpacity').value = 1.0;
                document.getElementById('objectColor').disabled = true;
                document.getElementById('objectOpacity').disabled = true;
            }

            document.querySelectorAll('.property-group').forEach(group => {
                if (group.dataset.type !== 'center') {
                    group.style.display = 'block';
                }
            });

            this.enablePropertyFields(true);
        } else {
            document.querySelectorAll('.property-group').forEach(group => {
                if (group.dataset.type !== 'center') {
                    group.style.display = 'none';
                }
            });

            if (this.selectedObjects.length > 1) {
                document.querySelectorAll('.property-group').forEach(group => {
                    if (group.dataset.type === 'center') {
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
                field.disabled = !enabled || this.selectedObjects.length !== 1;

                if (id === 'objectColor' || id === 'objectOpacity') {
                    if (this.selectedObjects.length === 1 && this.selectedObjects[0].material) {
                        field.disabled = false;
                    } else {
                        field.disabled = true;
                    }
                }
            }
        });

        const applyButton = document.getElementById('applySize');
        if (applyButton) {
            applyButton.disabled = !enabled || this.selectedObjects.length !== 1;
        }

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
            extrude: 'Вытягивание',
            rulerTool: 'Линейка',
            gearGenerator: 'Шестерня',
            threadGenerator: 'Резьба',
            workplane: 'Рабочая плоскость'
        };

        const modeText = modeNames[this.currentTool] || this.currentTool;
        document.getElementById('modeIndicator').innerHTML =
            `<i class="fas fa-mouse-pointer"></i> Режим: ${modeText}`;
        document.getElementById('selectedInfo').textContent =
            `Выбрано: ${this.selectedObjects.length}`;

        this.updateToolButtons();
    }

    updateToolButtons() {
        document.querySelectorAll('[data-tool]').forEach(btn => {
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

        const newDimensions = {
            x: Math.round(sizeX),
            y: Math.round(sizeY),
            z: Math.round(sizeZ)
        };

        document.getElementById('sizeXInput').value = newDimensions.x;
        document.getElementById('sizeYInput').value = newDimensions.y;
        document.getElementById('sizeZInput').value = newDimensions.z;

        if (this.transformControls) {
            if (this.transformControls.attachedObject === obj) {
                this.transformControls.updateObjectSize(obj, newDimensions);
            } else {
                this.transformControls.updateObjectSizeDirect(obj, newDimensions);
            }
        }

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

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(plane, intersection)) {
            document.getElementById('coords').textContent =
                `X: ${intersection.x.toFixed(2)}, Y: ${intersection.y.toFixed(2)}, Z: ${intersection.z.toFixed(2)}`;
        }
    }

    // ЦВЕТ И ПРОЗРАЧНОСТЬ
    onObjectColorChange(e) {
        if (this.selectedObjects.length !== 1) return;

        const object = this.selectedObjects[0];
        let material = object.material;

        if (!material) {
            material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                side: THREE.FrontSide
            });
            object.material = material;

            if (!object.userData.originalMaterial) {
                object.userData.originalMaterial = material.clone();
            }
        }

        if (!material.color) {
            this.showStatus('Материал объекта не поддерживает изменение цвета', 'error');
            return;
        }

        const newColor = e.target.value;
        const previousColor = material.color.getHex ? material.color.getHex() : 0x808080;

        this.setObjectColor(object, newColor);

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
        let material = object.material;

        if (!material) {
            material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                side: THREE.FrontSide,
                transparent: true
            });
            object.material = material;

            if (!object.userData.originalMaterial) {
                object.userData.originalMaterial = material.clone();
            }
        }

        const opacity = parseFloat(e.target.value);
        const previousOpacity = material.opacity !== undefined ? material.opacity : 1.0;

        this.setObjectOpacity(object, opacity);

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

        const newColor = new THREE.Color(colorValue);

        if (!object.material) {
            object.material = new THREE.MeshStandardMaterial({
                color: newColor,
                side: THREE.FrontSide
            });
            object.material.needsUpdate = true;

            object.userData.originalMaterial = object.material.clone();
            object.userData.currentColor = colorValue;
            return;
        }

        if (object.userData.originalMaterial) {
            const originalClone = object.userData.originalMaterial.clone();
            originalClone.color.copy(newColor);
            object.userData.originalMaterial = originalClone;
        } else {
            object.userData.originalMaterial = object.material.clone();
            object.userData.originalMaterial.color.copy(newColor);
        }

        object.material.color.copy(newColor);
        object.material.needsUpdate = true;
        object.userData.currentColor = colorValue;
    }

    setObjectOpacity(object, opacity) {
        if (!object) return;

        if (!object.material) {
            object.material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                side: THREE.FrontSide,
                transparent: opacity < 1.0,
                opacity: opacity
            });
            object.material.needsUpdate = true;

            object.userData.originalMaterial = object.material.clone();
            object.userData.currentOpacity = opacity;
            return;
        }

        if (object.userData.originalMaterial) {
            const originalClone = object.userData.originalMaterial.clone();
            originalClone.opacity = opacity;
            originalClone.transparent = opacity < 1.0;
            object.userData.originalMaterial = originalClone;
        } else {
            object.userData.originalMaterial = object.material.clone();
            object.userData.originalMaterial.opacity = opacity;
            object.userData.originalMaterial.transparent = opacity < 1.0;
        }

        object.material.opacity = opacity;
        object.material.transparent = opacity < 1.0;
        object.material.needsUpdate = true;
        object.userData.currentOpacity = opacity;
    }

    // ПОИСК ОБЪЕКТОВ
    findObjectByUuid(uuid) {
        return this.objects.find(obj => obj.uuid === uuid) || null;
    }

    // GETTERS
//    get gizmoGroup() {
//        return this.transformControls ? this.transformControls.gizmoGroup : null;
//    }
}

// Инициализация редактора
window.addEventListener('DOMContentLoaded', () => {
    window.cadEditor = new CADEditor();
});