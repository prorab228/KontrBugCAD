// ExtrudeManager.js - полностью доработанная версия
class ExtrudeManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.extrudePreview = null;
        this.extrudePreviewGroup = null;
        this.dragging = false;
        this.startHeight = 0;
        this.startMouseY = 0;
        this.currentOperation = 'new';
        this.currentDirection = 'positive';
        this.selectedContours = [];
        this.previewMaterial = null;
        this.arrowHandle = null;
        this.lastIntersectPoint = null;
        this.selectedFigures = [];
        this.basePlane = null;
        this.figureCache = null;
        this.figureCacheTimestamp = 0;
        this.lineGraphs = new Map();
        this.selectionMode = 'figure';
        this.autoDetectFigures = true;
        
        // Для стрелки вытягивания
        this.extrudeArrow = null;
        this.isDraggingArrow = false;
        this.arrowStartPosition = null;
        this.arrowStartHeight = 0;

    }

    // === МЕТОДЫ ДЛЯ СТРЕЛКИ ВЫТЯГИВАНИЯ ===

    createExtrudeDirectionIndicator(figures) {
        // Удаляем старую стрелку
        if (this.extrudeArrow) {
            if (this.extrudeArrow.parent) {
                this.extrudeArrow.parent.remove(this.extrudeArrow);
            }
            this.extrudeArrow = null;
        }

        if (!figures || figures.length === 0 || !this.basePlane) return;

        const figure = figures[0];
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        // Создаем группу для стрелки
        this.extrudeArrow = new THREE.Group();
        this.extrudeArrow.userData.isExtrudeArrow = true;
        this.extrudeArrow.userData.isDraggable = true;

        // Отключаем raycast для всей группы стрелки
        this.extrudeArrow.raycast = () => {};

        // Параметры стрелки
        const arrowLength = 25;
        const arrowHeadLength = 8;
        const arrowHeadWidth = 4;

        // Линия стрелки
        const lineGeometry = new THREE.CylinderGeometry(0.8, 0.8, arrowLength, 8);
        const lineMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.position.y = arrowLength / 2;
        line.userData.isArrowPart = true;
        line.userData.isDraggable = false;
        line.raycast = () => {};
        this.extrudeArrow.add(line);

        // Наконечник стрелки
        const coneGeometry = new THREE.ConeGeometry(arrowHeadWidth, arrowHeadLength, 8);
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.y = arrowLength + arrowHeadLength / 2;
        cone.userData.isArrowPart = true;
        cone.userData.isArrowHandle = true;
        cone.userData.isDraggable = true;

        // Добавляем на кончик большую невидимую сферу для лучшего захвата
        const handleGeometry = new THREE.SphereGeometry(arrowHeadWidth * 1.5, 8, 8);
        const handleMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF0000,
            transparent: true,
            opacity: 0.2,
            visible: true,
            depthTest: true,
            depthWrite: false
        });

        this.arrowHandle = new THREE.Mesh(handleGeometry, handleMaterial);
        this.arrowHandle.position.y = arrowLength + arrowHeadLength;
        this.arrowHandle.userData.isArrowHandle = true;
        this.arrowHandle.userData.isDraggable = true;

        // Добавляем конус и ручку в группу стрелки
        this.extrudeArrow.add(cone);
        this.extrudeArrow.add(this.arrowHandle);

        // Ориентируем стрелку по нормали плоскости
        const up = new THREE.Vector3(0, 1, 0);
        const rotationQuaternion = new THREE.Quaternion().setFromUnitVectors(
            up,
            planeNormal.clone().normalize()
        );
        this.extrudeArrow.quaternion.copy(rotationQuaternion);

        // Позиционируем стрелку
        this.updateArrowPosition();

        // Добавляем стрелку в сцену
        this.editor.scene.add(this.extrudeArrow);
    }

    updateArrowPosition() {
        if (!this.extrudeArrow || !this.basePlane) return;

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';

        const selectedFigures = this.getSelectedFigures();
        if (selectedFigures.length === 0) return;

        // Получаем нормаль плоскости
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        // Получаем СРЕДНЮЮ ТОЧКУ ВСЕХ ВЫБРАННЫХ ФИГУР
        const figuresCenter = this.getFiguresCenter(selectedFigures);

        // Преобразуем локальный центр в мировые координаты
        const worldCenter = this.basePlane.localToWorld(figuresCenter.clone());

        // Получаем позицию плоскости в мировых координатах
        const planePos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planePos);

        // Вектор от плоскости до центра фигур
        const offsetVector = new THREE.Vector3().subVectors(worldCenter, planePos);

        // Базовое положение стрелки (на плоскости в центре фигур)
        const basePos = planePos.clone().add(offsetVector);

        // Рассчитываем смещение стрелки в зависимости от направления
        let previewCenterOffset = 0;

        if (direction === 'positive') {
            previewCenterOffset = height / 2;
        } else if (direction === 'negative') {
            previewCenterOffset = -height / 2;
        } else if (direction === 'both') {
            previewCenterOffset = 0;
        }

        // Позиция стрелки = базовое положение + смещение по нормали
        const arrowPos = basePos.clone().add(
            planeNormal.clone().multiplyScalar(previewCenterOffset + 2)
        );

        // Обновляем позицию стрелки
        this.extrudeArrow.position.copy(arrowPos);

        // Обновляем мировую матрицу
        this.extrudeArrow.updateMatrixWorld(true);
    }

    getFiguresCenter(figures) {
        const center = new THREE.Vector3(0, 0, 0);
        let totalWeight = 0;
        
        figures.forEach(figure => {
            const figCenter = figure.outer.center;
            const weight = figure.outer.area || 1;
            center.x += figCenter.x * weight;
            center.y += figCenter.y * weight;
            totalWeight += weight;
        });
        
        if (totalWeight > 0) {
            center.x /= totalWeight;
            center.y /= totalWeight;
        }
        
        return center;
    }

    handleArrowDrag(event) {
        if (!this.isDraggingArrow || !this.extrudeArrow || !this.basePlane) return;

        // Рассчитываем изменение высоты на основе движения мыши по Y
        const deltaY = this.startMouseY - event.clientY; // Инвертируем для интуитивного управления
        const sensitivity = 0.5; // Чувствительность

        let newHeight = this.arrowStartHeight + deltaY * sensitivity;
        newHeight = Math.max(0.1, Math.min(newHeight, 1000)); // Ограничиваем 1000 мм
        newHeight = Math.round(newHeight * 10) / 10;

        // Обновляем поле ввода высоты
        const heightInput = document.getElementById('extrudeHeight');
        if (heightInput) {
            heightInput.value = newHeight;

            // НЕ триггерим событие input во время перетаскивания - обновляем напрямую
            // Это предотвратит многократные обновления превью
            if (this.extrudePreviewGroup) {
                // Обновляем превью напрямую
                this.updateExtrudePreviewDirect(newHeight);
            }

            // Обновляем позицию стрелки
            this.updateArrowPositionDirect(newHeight);
        }

        event.preventDefault();
    }

    // Прямое обновление позиции стрелки
    updateArrowPositionDirect(height) {
        if (!this.extrudeArrow || !this.basePlane) return;

        const direction = document.getElementById('extrudeDirection')?.value || 'positive';
        const selectedFigures = this.getSelectedFigures();
        if (selectedFigures.length === 0) return;

        // Получаем нормаль плоскости
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        // Получаем СРЕДНЮЮ ТОЧКУ ВСЕХ ВЫБРАННЫХ ФИГУР
        const figuresCenter = this.getFiguresCenter(selectedFigures);
        const worldCenter = this.basePlane.localToWorld(figuresCenter.clone());

        // Получаем позицию плоскости в мировых координатах
        const planePos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planePos);

        // Вектор от плоскости до центра фигур
        const offsetVector = new THREE.Vector3().subVectors(worldCenter, planePos);

        // Базовое положение стрелки (на плоскости в центре фигур)
        const basePos = planePos.clone().add(offsetVector);

        // Рассчитываем смещение стрелки в зависимости от направления
        let previewCenterOffset = 0;

        if (direction === 'positive') {
            previewCenterOffset = height / 2;
        } else if (direction === 'negative') {
            previewCenterOffset = -height / 2;
        } else if (direction === 'both') {
            previewCenterOffset = 0;
        }

        // Позиция стрелки = базовое положение + смещение по нормали
        const arrowPos = basePos.clone().add(
            planeNormal.clone().multiplyScalar(previewCenterOffset + 2)
        );

        // Обновляем позицию стрелки
        this.extrudeArrow.position.copy(arrowPos);
        this.extrudeArrow.updateMatrixWorld(true);
    }

    // Прямое обновление превью без полной перестройки
    updateExtrudePreviewDirect(height) {
        if (!this.extrudePreviewGroup || !this.basePlane) return;

        const direction = document.getElementById('extrudeDirection')?.value || 'positive';
        const selectedFigures = this.getSelectedFigures();

        // Получаем нормаль плоскости
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        // Получаем позицию плоскости
        const planePos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planePos);

        // Обновляем только масштаб по Z у превью меша
        const previewMesh = this.extrudePreviewGroup.children[0];
        if (previewMesh && previewMesh.geometry) {
            // Масштабируем по Z
            const scaleZ = height / 10; // 10 - базовая высота
            previewMesh.scale.z = scaleZ;

            // Обновляем позицию в зависимости от направления
            let positionOffset = 0;
            if (direction === 'positive') {
                positionOffset = height / 2 + 0.1;
            } else if (direction === 'negative') {
                positionOffset = -height / 2 + 0.1;
            } else {
                positionOffset = 0.1;
            }

            // Позиция меша
            previewMesh.position.copy(planePos);
            previewMesh.position.add(planeNormal.clone().multiplyScalar(positionOffset));
        }
    }



    handleArrowDrag(event) {
        if (!this.isDraggingArrow || !this.extrudeArrow || !this.basePlane) return;

        const selectedFigures = this.getSelectedFigures();
        if (selectedFigures.length === 0) return;

        // Рассчитываем изменение высоты на основе движения мыши по Y
        const deltaY = event.clientY - this.startMouseY;
        const sensitivity = 0.1; // Уменьшаем чувствительность
        let heightChange = deltaY * sensitivity; // Инвертируем, так как движение вниз должно уменьшать высоту

        // Определяем, с какой стороны плоскости находится камера
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        const cameraPosition = this.editor.camera.position;
        const planeWorldPos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planeWorldPos);
        const cameraToPlane = new THREE.Vector3().subVectors(cameraPosition, planeWorldPos).normalize();
        const dot = cameraToPlane.dot(planeNormal);

        // Если камера с обратной стороны, инвертируем изменение высоты
        if (dot < 0) {
            heightChange = -heightChange;
        }

        let newHeight = this.arrowStartHeight + heightChange;
        newHeight = Math.max(0.1, newHeight);
        newHeight = Math.round(newHeight * 10) / 10;

        // Обновляем поле ввода высоты
        const heightInput = document.getElementById('extrudeHeight');
        if (heightInput) {
            heightInput.value = newHeight;

            // Триггерим событие input для обновления превью
            const inputEvent = new Event('input', { bubbles: true });
            heightInput.dispatchEvent(inputEvent);

            this.updateExtrudePreview();
            this.updateArrowPosition();
        }

        event.preventDefault();
    }

    handleArrowDragStart(event) {
        if (!this.extrudeArrow) return false;

        this.editor.updateMousePosition(event);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Собираем все перетаскиваемые части стрелки
        const draggableParts = [];

        if (this.extrudeArrow) {
            this.extrudeArrow.traverse((child) => {
                if (child.userData && child.userData.isDraggable) {
                    draggableParts.push(child);
                }
            });
        }

        if (draggableParts.length === 0) return false;

        // Обновляем мировые матрицы
        draggableParts.forEach(part => part.updateMatrixWorld(true));

        // Проверяем пересечение с перетаскиваемыми частями
        const intersects = this.editor.raycaster.intersectObjects(draggableParts, true);

        if (intersects.length > 0) {
            this.isDraggingArrow = true;
            this.startMouseY = event.clientY; // Сохраняем начальную позицию мыши
            this.arrowStartHeight = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
            document.body.style.cursor = 'grabbing';

            // Захватываем события мыши на весь документ
            this.bindGlobalDragHandlers();

            event.stopPropagation();
            event.preventDefault();
            return true;
        }

        return false;
    }

    // Добавьте методы для глобального захвата событий
    bindGlobalDragHandlers() {
        this.globalMouseMoveHandler = (e) => {
            if (this.isDraggingArrow) {
                this.handleArrowDrag(e);
            }
        };

        this.globalMouseUpHandler = (e) => {
            if (this.isDraggingArrow && e.button === 0) {
                this.handleArrowDragEnd();
            }
        };

        document.addEventListener('mousemove', this.globalMouseMoveHandler);
        document.addEventListener('mouseup', this.globalMouseUpHandler);
    }

    unbindGlobalDragHandlers() {
        if (this.globalMouseMoveHandler) {
            document.removeEventListener('mousemove', this.globalMouseMoveHandler);
            this.globalMouseMoveHandler = null;
        }

        if (this.globalMouseUpHandler) {
            document.removeEventListener('mouseup', this.globalMouseUpHandler);
            this.globalMouseUpHandler = null;
        }
    }



    // При завершении перетаскивания обновляем превью полностью
    handleArrowDragEnd() {
        this.isDraggingArrow = false;
        this.unbindGlobalDragHandlers();
        document.body.style.cursor = 'default';

        // Полностью обновляем превью для чистоты геометрии
        this.updateExtrudePreview();
        this.updateArrowPosition();

        // Сохраняем конечную высоту
        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        this.editor.showStatus(`Высота установлена: ${height.toFixed(1)} мм`, 'info');
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    isSketchElementClosed(element) {
        if (!element || !element.userData) return false;

        if (element.userData.isClosed !== undefined) {
            return element.userData.isClosed === true;
        }

        const type = element.userData.elementType;
        if (type === 'rectangle' || type === 'circle' || 
            type === 'polygon' || type === 'oval' || 
            type === 'stadium' || type === 'arc') {
            return true;
        }

        if (type === 'line') {
            return false;
        }

        if (type === 'polyline') {
            if (!element.geometry || !element.geometry.attributes.position) {
                return false;
            }

            const positions = element.geometry.attributes.position.array;
            if (positions.length < 6) return false;

            const count = positions.length / 3;
            if (count < 3) return false;

            const x1 = positions[0], y1 = positions[1];
            const lastIndex = positions.length - 3;
            const x2 = positions[lastIndex], y2 = positions[lastIndex + 1];

            const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            return distance < 0.5;
        }

        return false;
    }

    findSketchPlaneForElement(element) {
        if (!element) return null;

        let parent = element.parent;
        while (parent) {
            if (parent.userData &&
                (parent.userData.type === 'sketch_plane' ||
                 parent.userData.type === 'work_plane')) {
                return parent;
            }
            parent = parent.parent;
        }

        return this.editor.sketchPlanes.length > 0 ?
               this.editor.sketchPlanes[0] :
               this.editor.workPlanes.length > 0 ?
               this.editor.workPlanes[0] : null;
    }

    // === МЕТОДЫ ДЛЯ РАБОТЫ С ФИГУРАМИ ===

    collectAllFigures() {
        const now = Date.now();
        if (this.figureCache && now - this.figureCacheTimestamp < 100) {
            return this.figureCache;
        }

        const allElements = this.editor.objectsManager.getAllSketchElements();
        
        // 1. Собираем простые замкнутые элементы
        const simpleContours = this.collectSimpleContours(allElements);
        
        // 2. Собираем контуры из линий
        let lineContours = [];
        if (this.autoDetectFigures) {
            lineContours = this.collectLineContours(allElements);
        }
        
        // 3. Объединяем все контуры в фигуры с учетом вложенности
        const figures = this.groupContoursIntoFigures([...simpleContours, ...lineContours]);
        
        this.figureCache = figures;
        this.figureCacheTimestamp = now;
        return figures;
    }

    collectSimpleContours(allElements) {
        const contours = [];
        
        allElements.forEach(element => {
            if (this.isSketchElementClosed(element)) {
                const points = this.getElementPoints(element);
                const area = this.calculatePolygonArea(points);
                const center = this.calculateContourCenter(points);
                
                if (points.length >= 3 && Math.abs(area) > 0.001) {
                    contours.push({
                        element: element,
                        points: points,
                        area: Math.abs(area),
                        center: center,
                        boundingBox: this.calculateBoundingBox(points),
                        type: 'simple',
                        isClockwise: area > 0,
                        isHole: false
                    });
                }
            }
        });
        
        return contours;
    }

    collectLineContours(allElements) {
        const lines = allElements.filter(element => 
            element.userData.elementType === 'line' || 
            element.userData.elementType === 'polyline'
        );
        
        if (lines.length === 0) return [];
        
        const graphData = this.buildLineGraphs();
        const rawContours = this.findClosedContoursInGraph(graphData);
        
        const contours = [];
        const processedLines = new Set();
        
        rawContours.forEach((rawContour, index) => {
            const contourElements = [];
            const edgeSet = new Set();
            
            for (let i = 0; i < rawContour.vertices.length; i++) {
                const v1 = rawContour.vertices[i];
                const v2 = rawContour.vertices[(i + 1) % rawContour.vertices.length];
                
                const edgeKey = `${Math.min(v1, v2)}-${Math.max(v1, v2)}`;
                if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);
                    
                    const matchingEdge = graphData.edges.find(([ev1, ev2]) => 
                        (ev1 === v1 && ev2 === v2) || (ev1 === v2 && ev2 === v1)
                    );
                    
                    if (matchingEdge) {
                        const element = matchingEdge[2];
                        if (!processedLines.has(element)) {
                            contourElements.push(element);
                            processedLines.add(element);
                        }
                    }
                }
            }
            
            if (contourElements.length > 0) {
                const center = this.calculateContourCenter(rawContour.points);
                const area = this.calculatePolygonArea(rawContour.points);
                
                contours.push({
                    elements: contourElements,
                    points: rawContour.points,
                    area: Math.abs(area),
                    center: center,
                    boundingBox: this.calculateBoundingBox(rawContour.points),
                    type: 'line',
                    isClockwise: rawContour.isClockwise,
                    isClosed: true,
                    isHole: false,
                    contourId: `line_contour_${index}`
                });
            }
        });
        
        return contours;
    }

    buildLineGraphs() {
        this.lineGraphs.clear();
        
        const allElements = this.editor.objectsManager.getAllSketchElements();
        const lines = allElements.filter(element => 
            element.userData.elementType === 'line' || 
            element.userData.elementType === 'polyline'
        );
        
        const vertices = new Map();
        const edges = [];
        
        lines.forEach(element => {
            const points = this.getElementPoints(element);
            if (points.length < 2) return;
            
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                
                const key1 = `${p1.x.toFixed(4)},${p1.y.toFixed(4)}`;
                const key2 = `${p2.x.toFixed(4)},${p2.y.toFixed(4)}`;
                
                if (!vertices.has(key1)) vertices.set(key1, vertices.size);
                if (!vertices.has(key2)) vertices.set(key2, vertices.size);
                
                edges.push([
                    vertices.get(key1),
                    vertices.get(key2),
                    element
                ]);
            }
        });
        
        const graph = new Map();
        edges.forEach(([v1, v2, element]) => {
            if (!graph.has(v1)) graph.set(v1, []);
            if (!graph.has(v2)) graph.set(v2, []);
            
            graph.get(v1).push({ vertex: v2, element });
            graph.get(v2).push({ vertex: v1, element });
        });
        
        const graphData = {
            vertices: Array.from(vertices.keys()).map(key => {
                const [x, y] = key.split(',').map(Number);
                return new THREE.Vector2(x, y);
            }),
            graph: graph,
            edges: edges
        };
        
        this.lineGraphs.set('all', graphData);
        return graphData;
    }

    findClosedContoursInGraph(graphData) {
        const contours = [];
        const visitedEdges = new Set();
        const vertexCoords = graphData.vertices;
        const graph = graphData.graph;
        
        const findCycles = (startVertex, currentVertex, path, visitedVertices) => {
            if (path.length > 1 && currentVertex === startVertex) {
                if (path.length >= 3) {
                    const contourPoints = path.map(v => vertexCoords[v]);
                    const area = this.calculatePolygonArea(contourPoints);
                    if (Math.abs(area) > 0.001) {
                        contours.push({
                            vertices: [...path],
                            points: contourPoints,
                            area: Math.abs(area),
                            isClockwise: area > 0
                        });
                    }
                }
                return;
            }
            
            if (visitedVertices.has(currentVertex)) return;
            
            visitedVertices.add(currentVertex);
            
            const neighbors = graph.get(currentVertex) || [];
            for (const neighbor of neighbors) {
                const edgeKey = `${Math.min(currentVertex, neighbor.vertex)}-${Math.max(currentVertex, neighbor.vertex)}`;
                if (!visitedEdges.has(edgeKey)) {
                    visitedEdges.add(edgeKey);
                    path.push(neighbor.vertex);
                    findCycles(startVertex, neighbor.vertex, path, new Set([...visitedVertices]));
                    path.pop();
                    visitedEdges.delete(edgeKey);
                }
            }
        };
        
        for (let startVertex = 0; startVertex < vertexCoords.length; startVertex++) {
            findCycles(startVertex, startVertex, [startVertex], new Set());
        }
        
        const uniqueContours = [];
        const contourHashes = new Set();
        
        contours.forEach(contour => {
            const minIndex = Math.min(...contour.vertices);
            const startIdx = contour.vertices.indexOf(minIndex);
            const normalizedVertices = [
                ...contour.vertices.slice(startIdx),
                ...contour.vertices.slice(0, startIdx)
            ];
            
            const hash = normalizedVertices.join('-');
            if (!contourHashes.has(hash)) {
                contourHashes.add(hash);
                uniqueContours.push(contour);
            }
        });
        
        return uniqueContours;
    }

    groupContoursIntoFigures(contours) {
        const figures = [];
        
        // Сортируем по площади (от больших к меньшим)
        contours.sort((a, b) => b.area - a.area);
        
        // Массив для отслеживания использованных контуров
        const usedContours = new Set();
        
        for (let i = 0; i < contours.length; i++) {
            if (usedContours.has(i)) continue;
            
            const outerContour = contours[i];
            const holes = [];
            
            // Ищем контуры, которые находятся внутри этого контура
            for (let j = i + 1; j < contours.length; j++) {
                if (usedContours.has(j)) continue;
                
                const innerContour = contours[j];
                
                // Проверяем вложенность
                if (this.isContourInsideContour(innerContour, outerContour)) {
                    // Проверяем, что этот контур не пересекается с уже добавленными отверстиями
                    let isValidHole = true;
                    for (const hole of holes) {
                        if (this.doContoursIntersect(innerContour, hole)) {
                            isValidHole = false;
                            break;
                        }
                    }
                    
                    if (isValidHole) {
                        innerContour.isHole = true;
                        holes.push(innerContour);
                        usedContours.add(j);
                    }
                }
            }
            
            figures.push({
                outer: outerContour,
                holes: holes,
                area: outerContour.area,
                id: `figure_${Date.now()}_${i}`,
                selected: false,
                isStandalone: holes.length === 0,
                canBeSelected: true
            });
            
            usedContours.add(i);
        }
        
        return figures;
    }

    isContourInsideContour(contourA, contourB) {
        // Проверяем несколько точек контура A
        const testPoints = contourA.points;
        for (const point of testPoints) {
            if (!this.isPointInsidePolygon(point, contourB.points)) {
                return false;
            }
        }
        return true;
    }

    isPointInsidePolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            
            if (intersect) inside = !inside;
        }
        return inside;
    }

    doContoursIntersect(contourA, contourB) {
        const bboxA = contourA.boundingBox || this.calculateBoundingBox(contourA.points);
        const bboxB = contourB.boundingBox || this.calculateBoundingBox(contourB.points);
        
        return !(bboxA.max.x < bboxB.min.x || 
                bboxA.min.x > bboxB.max.x || 
                bboxA.max.y < bboxB.min.y || 
                bboxA.min.y > bboxB.max.y);
    }

    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

    getElementPoints(element) {
        if (!element.userData) return [];
        
        if (element.userData.localPoints) {
            return element.userData.localPoints.map(p => new THREE.Vector2(p.x, p.y));
        }
        
        if (element.geometry && element.geometry.attributes.position) {
            const positions = element.geometry.attributes.position.array;
            const points = [];
            for (let i = 0; i < positions.length; i += 3) {
                points.push(new THREE.Vector2(positions[i], positions[i + 1]));
            }
            return points;
        }
        
        return [];
    }

    calculatePolygonArea(points) {
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return area / 2;
    }

    calculateContourCenter(points) {
        const center = new THREE.Vector2(0, 0);
        points.forEach(p => {
            center.x += p.x;
            center.y += p.y;
        });
        if (points.length > 0) {
            center.x /= points.length;
            center.y /= points.length;
        }
        return center;
    }

    calculateBoundingBox(points) {
        if (points.length === 0) {
            return { min: new THREE.Vector2(0, 0), max: new THREE.Vector2(0, 0) };
        }
        
        const min = new THREE.Vector2(Infinity, Infinity);
        const max = new THREE.Vector2(-Infinity, -Infinity);
        
        points.forEach(p => {
            min.x = Math.min(min.x, p.x);
            min.y = Math.min(min.y, p.y);
            max.x = Math.max(max.x, p.x);
            max.y = Math.max(max.y, p.y);
        });
        
        return { min, max };
    }

    // === МЕТОДЫ ВЫБОРА ФИГУР ===

    selectFigureForExtrude(event) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        this.editor.raycaster.params.Line = { threshold: 5 };

        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        const intersects = this.editor.raycaster.intersectObjects(allSketchElements, false);

        if (intersects.length > 0) {
            const clickedElement = intersects[0].object;

            const allFigures = this.collectAllFigures();
            const clickedFigures = this.findFiguresContainingElement(allFigures, clickedElement);

            if (clickedFigures.length === 0) return false;

            // Определяем, является ли элемент частью внешнего контура или отверстия
            const isHole = this.isElementInHole(clickedElement, clickedFigures);

            if (event.ctrlKey || event.metaKey) {
                // Ctrl+клик: добавляем/удаляем из выделения
                this.handleMultiSelection(clickedFigures, isHole, clickedElement);
            } else {
                // Обычный клик: выделяем фигуру
                this.handleSingleSelection(clickedFigures, isHole, clickedElement);
            }

            this.updateExtrudePreview();
            this.updateExtrudeUI();
            this.createExtrudeDirectionIndicator(this.selectedFigures);
            return true;
        }

        return false;
    }

    isElementInHole(element, figures) {
        for (const figure of figures) {
            // Проверяем, находится ли элемент в отверстиях фигуры
            for (const hole of figure.holes) {
                if ((hole.element && hole.element === element) ||
                    (hole.elements && hole.elements.includes(element))) {
                    return true;
                }
            }
        }
        return false;
    }

    handleSingleSelection(figures, isHole, clickedElement) {
        this.clearFigureSelection();

        if (isHole) {
            // Клик по отверстию - создаем отдельную фигуру из отверстия
            const holeFigure = this.createHoleFigure(clickedElement, figures);
            if (holeFigure) {
                this.selectFigure(holeFigure);
            }
        } else {
            // Клик по внешней фигуре - выбираем всю фигуру со всеми отверстиями
            // Находим фигуру, которой принадлежит внешний контур
            for (const figure of figures) {
                if ((figure.outer.element && figure.outer.element === clickedElement) ||
                    (figure.outer.elements && figure.outer.elements.includes(clickedElement))) {
                    this.selectFigure(figure);
                    break;
                }
            }
        }
    }

    handleMultiSelection(figures, isHole, clickedElement) {
        if (isHole) {
            // Ctrl+клик по отверстию
            const holeFigure = this.createHoleFigure(clickedElement, figures);
            if (holeFigure) {
                // Проверяем, не является ли это отверстие частью уже выбранной внешней фигуры
                const parentFigure = this.findParentFigure(holeFigure);
                if (parentFigure && this.isFigureSelected(parentFigure)) {
                    // Если родительская фигура выбрана, удаляем это отверстие из неё
                    this.removeHoleFromFigure(parentFigure, holeFigure);
                    // И добавляем отверстие как отдельную фигуру
                    this.toggleFigureSelection(holeFigure);
                } else {
                    this.toggleFigureSelection(holeFigure);
                }
            }
        } else {
            // Ctrl+клик по внешней фигуре
            for (const figure of figures) {
                if ((figure.outer.element && figure.outer.element === clickedElement) ||
                    (figure.outer.elements && figure.outer.elements.includes(clickedElement))) {
                    this.toggleFigureSelection(figure);
                    break;
                }
            }
        }
    }

    createHoleFigure(clickedElement, figures) {
        // Находим отверстие, к которому принадлежит элемент
        for (const figure of figures) {
            for (const hole of figure.holes) {
                if ((hole.element && hole.element === clickedElement) ||
                    (hole.elements && hole.elements.includes(clickedElement))) {

                    // Создаем отдельную фигуру из отверстия
                    return {
                        outer: { ...hole },
                        holes: [],
                        area: hole.area,
                        id: `hole_figure_${Date.now()}_${Math.random()}`,
                        selected: false,
                        isStandalone: true,
                        canBeSelected: true,
                        isHole: true,
                        parentFigureId: figure.id
                    };
                }
            }
        }
        return null;
    }

    findParentFigure(holeFigure) {
        const allFigures = this.collectAllFigures();
        return allFigures.find(fig => fig.id === holeFigure.parentFigureId);
    }

    isFigureSelected(figure) {
        return this.selectedFigures.some(f => f.id === figure.id);
    }

    removeHoleFromFigure(figure, holeFigure) {
        // Находим и удаляем отверстие из списка отверстий фигуры
        const holeIndex = figure.holes.findIndex(hole => {
            if (holeFigure.outer.element) {
                return hole.element === holeFigure.outer.element;
            } else if (holeFigure.outer.elements) {
                return hole.elements && 
                       hole.elements.length === holeFigure.outer.elements.length &&
                       hole.elements.every((el, idx) => el === holeFigure.outer.elements[idx]);
            }
            return false;
        });
        
        if (holeIndex > -1) {
            figure.holes.splice(holeIndex, 1);
            // Обновляем подсветку
            this.highlightFigure(figure, 0x0066FF);
        }
    }

    findFiguresContainingElement(figures, element) {
        const containingFigures = [];
        
        figures.forEach(figure => {
            if (figure.outer.element === element || 
                (figure.outer.elements && figure.outer.elements.includes(element))) {
                containingFigures.push(figure);
                return;
            }
            
            if (figure.holes.some(hole => 
                hole.element === element || 
                (hole.elements && hole.elements.includes(element)))) {
                containingFigures.push(figure);
                return;
            }
        });
        
        return containingFigures;
    }

    selectFigure(figure) {
        if (!figure.selected) {
            const figurePlane = this.getFigurePlane(figure);

            if (this.selectedFigures.length === 0) {
                this.basePlane = figurePlane;
                figure.selected = true;
                this.selectedFigures.push(figure);
                this.highlightFigure(figure, 0x0066FF);
            } else {
                if (this.arePlanesCompatible(figurePlane, this.basePlane)) {
                    figure.selected = true;
                    this.selectedFigures.push(figure);
                    this.highlightFigure(figure, 0x0066FF);
                } else {
                    this.editor.showStatus('Фигура находится на другой плоскости', 'warning');
                    return;
                }
            }
        }
    }

    toggleFigureSelection(figure) {
        if (figure.selected) {
            this.deselectFigure(figure);
        } else {
            this.selectFigure(figure);
        }
    }

    highlightFigure(figure, color) {
        if (figure.outer.element) {
            this.editor.objectsManager.safeSetElementColor(figure.outer.element, color);
        } else if (figure.outer.elements) {
            figure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeSetElementColor(element, color);
            });
        }
        
        figure.holes.forEach(hole => {
            if (hole.element) {
                this.editor.objectsManager.safeSetElementColor(hole.element, color);
            } else if (hole.elements) {
                hole.elements.forEach(element => {
                    this.editor.objectsManager.safeSetElementColor(element, color);
                });
            }
        });
    }

    getFigurePlane(figure) {
        let element = null;
        
        if (figure.outer.element) {
            element = figure.outer.element;
        } else if (figure.outer.elements && figure.outer.elements.length > 0) {
            element = figure.outer.elements[0];
        }
        
        if (element) {
            return this.findSketchPlaneForElement(element);
        }
        
        return null;
    }

    arePlanesCompatible(plane1, plane2) {
        if (!plane1 || !plane2) return false;
        
        const pos1 = plane1.position;
        const pos2 = plane2.position;
        const quat1 = plane1.quaternion;
        const quat2 = plane2.quaternion;
        
        const distance = pos1.distanceTo(pos2);
        const angle = quat1.angleTo(quat2);
        
        return distance < 0.001 && angle < 0.001;
    }

    deselectFigure(figure) {
        const index = this.selectedFigures.indexOf(figure);
        if (index > -1) {
            this.selectedFigures.splice(index, 1);
            figure.selected = false;
            this.unhighlightFigure(figure);

            if (this.selectedFigures.length === 0) {
                this.basePlane = null;
            }
        }
    }

    unhighlightFigure(figure) {
        this.highlightFigure(figure, null);
    }

    clearFigureSelection() {
        this.selectedFigures.forEach(figure => {
            this.deselectFigure(figure);
        });
        this.selectedFigures = [];
        this.basePlane = null;
    }

    getSelectedFigures() {
        return this.selectedFigures;
    }

    // === МЕТОДЫ СОЗДАНИЯ ГЕОМЕТРИИ ===

    createExtrusionGeometryFromFigures(figures, height, direction) {
        if (figures.length === 0 || !this.basePlane) return null;

        const shapes = [];

        figures.forEach(figure => {
            // Если это отверстие, создаем фигуру из него
            if (figure.isHole) {
                const points = this.getFigurePointsForBasePlane(figure);
                if (points.length >= 3) {
                    const shapePoints = points.map(p => new THREE.Vector2(p.x, p.y));
                    const shape = new THREE.Shape(shapePoints);
                    shapes.push(shape);
                }
            } else {
                // Если это внешняя фигура
                const points = this.getFigurePointsForBasePlane(figure);

                if (points.length < 3) return;

                const shapePoints = points.map(p => new THREE.Vector2(p.x, p.y));
                const shape = new THREE.Shape(shapePoints);

                // Добавляем отверстия, которые не выбраны отдельно
                figure.holes.forEach(hole => {
                    // Проверяем, не выбрано ли это отверстие отдельно
                    const isHoleSelected = this.selectedFigures.some(f =>
                        f.isHole && f.outer === hole
                    );

                    if (!isHoleSelected) {
                        const holePoints = this.getContourPointsForBasePlane(hole);
                        if (holePoints.length >= 3) {
                            const holePath = new THREE.Path(holePoints.map(p => new THREE.Vector2(p.x, p.y)));
                            shape.holes.push(holePath);
                        }
                    }
                });

                shapes.push(shape);
            }
        });

        if (shapes.length === 0) return null;

        let extrudeDepth = height;
        const extrudeSettings = {
            depth: extrudeDepth,
            bevelEnabled: false,
            steps: 1
        };
        
        try {
            const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);

            if (direction === 'negative') {
                geometry.translate(0, 0, -height);
            } else if (direction === 'both') {
                geometry.translate(0, 0, -height / 2);
            }

            return geometry;
        } catch (error) {
            console.error('Ошибка создания геометрии выдавливания:', error);
            return null;
        }
    }

    getFigurePointsForBasePlane(figure) {
        const figurePlane = this.getFigurePlane(figure);
        if (!figurePlane) return figure.outer.points || [];
        
        if (this.arePlanesCompatible(figurePlane, this.basePlane)) {
            return figure.outer.points || [];
        }
        
        return (figure.outer.points || []).map(point => {
            const localPoint3D = new THREE.Vector3(point.x, point.y, 0);
            const worldPoint = figurePlane.localToWorld(localPoint3D.clone());
            const baseLocalPoint = this.basePlane.worldToLocal(worldPoint.clone());
            return new THREE.Vector2(baseLocalPoint.x, baseLocalPoint.y);
        });
    }

    getContourPointsForBasePlane(contour) {
        const figurePlane = this.getFigurePlane({ outer: contour });
        if (!figurePlane) return contour.points || [];
        
        if (this.arePlanesCompatible(figurePlane, this.basePlane)) {
            return contour.points || [];
        }
        
        return (contour.points || []).map(point => {
            const localPoint3D = new THREE.Vector3(point.x, point.y, 0);
            const worldPoint = figurePlane.localToWorld(localPoint3D.clone());
            const baseLocalPoint = this.basePlane.worldToLocal(worldPoint.clone());
            return new THREE.Vector2(baseLocalPoint.x, baseLocalPoint.y);
        });
    }

    // === МЕТОДЫ ПРЕДПРОСМОТРА ===

    // Оптимизированный метод обновления превью
    updateExtrudePreview() {
        const selectedFigures = this.getSelectedFigures();
        if (selectedFigures.length === 0) {
            this.removeExtrudePreview();
            return;
        }

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';

        // Если превью уже существует, просто обновляем его геометрию
        if (this.extrudePreviewGroup && this.extrudePreviewGroup.children.length > 0) {
            const previewMesh = this.extrudePreviewGroup.children[0];
            const newGeometry = this.createExtrusionGeometryFromFigures(selectedFigures, height, direction);

            if (newGeometry) {
                // Заменяем только геометрию, не пересоздаем весь меш
                previewMesh.geometry.dispose();
                previewMesh.geometry = newGeometry;

                // Обновляем позицию
                this.updatePreviewPosition(previewMesh, height, direction);
            }
        } else {
            // Создаем новое превью
            this.createNewExtrudePreview(selectedFigures, height, direction);
        }
    }

    // Создание нового превью (используется только при первом выборе)
    createNewExtrudePreview(selectedFigures, height, direction) {
        this.removeExtrudePreview();

        const geometry = this.createExtrusionGeometryFromFigures(selectedFigures, height, direction);
        if (!geometry) return;

        if (!this.previewMaterial) {
            this.previewMaterial = new THREE.MeshPhongMaterial({
                color: 0x4CAF50,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
        }

        const previewMesh = new THREE.Mesh(geometry, this.previewMaterial);

        // Обновляем позицию
        this.updatePreviewPosition(previewMesh, height, direction);

        this.extrudePreviewGroup = new THREE.Group();
        this.extrudePreviewGroup.add(previewMesh);
        this.editor.objectsGroup.add(this.extrudePreviewGroup);
    }

    // Обновление позиции превью
    updatePreviewPosition(mesh, height, direction) {
        if (!mesh || !this.basePlane) return;

        const planeWorldPos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planeWorldPos);

        mesh.position.copy(planeWorldPos);
        mesh.quaternion.copy(this.basePlane.quaternion);

        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        let offset = 0.1;
        if (direction === 'negative') {
            offset = -height + 0.1;
        } else if (direction === 'both') {
            offset = -height / 2 + 0.1;
        }

        mesh.position.add(planeNormal.clone().multiplyScalar(offset));
    }


    removeExtrudePreview() {
        if (this.extrudePreviewGroup) {
            this.editor.objectsGroup.remove(this.extrudePreviewGroup);
            this.extrudePreviewGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.extrudePreviewGroup = null;
        }
    }

    // === МЕТОДЫ ОТОБРАЖЕНИЯ И ВВОДА ===

    highlightFiguresOnHover(event) {
        if (this.dragging || this.isDraggingArrow) return;

        this.editor.updateMousePosition(event);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        const selectableElements = allSketchElements.filter(element =>
            this.isSketchElementClosed(element) ||
            element.userData.elementType === 'line' ||
            element.userData.elementType === 'polyline'
        );

        const selectedFigures = this.getSelectedFigures();
        const selectedElements = new Set();
        
        selectedFigures.forEach(figure => {
            if (figure.outer.element) selectedElements.add(figure.outer.element);
            if (figure.outer.elements) figure.outer.elements.forEach(el => selectedElements.add(el));
            figure.holes.forEach(hole => {
                if (hole.element) selectedElements.add(hole.element);
                if (hole.elements) hole.elements.forEach(el => selectedElements.add(el));
            });
        });

        selectableElements.forEach(element => {
            if (!selectedElements.has(element) && element.userData.hoverHighlighted) {
                this.editor.objectsManager.safeRestoreElementColor(element);
                element.userData.hoverHighlighted = false;
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(selectableElements, false);

        if (intersects.length > 0) {
            const element = intersects[0].object;
            
            if (!selectedElements.has(element)) {
                const allFigures = this.collectAllFigures();
                const containingFigures = this.findFiguresContainingElement(allFigures, element);
                
                if (containingFigures.length > 0) {
                    document.body.style.cursor = 'pointer';
                    
                    containingFigures.forEach(figure => {
                        this.highlightFigure(figure, 0xFFFF00);
                    });
                    
                    element.userData.hoverHighlighted = true;
                } else {
                    document.body.style.cursor = 'default';
                }
            } else {
                document.body.style.cursor = 'default';
            }
        } else {
            document.body.style.cursor = 'default';
        }
    }

    showExtrudeUI() {
        const oldUI = document.getElementById('extrudeUI');
        if (oldUI) oldUI.remove();

        const selectedFigures = this.getSelectedFigures();
        const selectedCount = selectedFigures.length;

        const container = document.createElement('div');
        container.id = 'extrudeUI';
        container.className = 'extrude-ui';
        container.innerHTML = `
            <div class="extrude-header">
                <h3><i class="fas fa-arrows-alt-v"></i> Вытягивание фигур</h3>
                <button id="cancelExtrude" class="btn-secondary">
                    <i class="fas fa-times"></i> Отмена
                </button>
            </div>
            <div class="extrude-controls">
                <div class="control-group">
                    <label>Высота (мм):</label>
                    <input type="number" id="extrudeHeight" value="10" step="0.1" min="0.1" style="width: 100px;">
                </div>
                <div class="control-group">
                    <label>Направление:</label>
                    <select id="extrudeDirection">
                        <option value="positive">Наружу (по нормали)</option>
                        <option value="negative">Внутрь (против нормали)</option>
                        <option value="both">В обе стороны</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Операция:</label>
                    <select id="extrudeOperation">
                        <option value="new">Новый объект</option>
                        <option value="cut">Вырезать из существующих</option>
                        <option value="join">Объединить с существующими</option>
                    </select>
                </div>
                <div class="extrude-info">
                    <div id="selectedContourInfo" style="font-size: 12px; margin: 10px 0;">
                        ${selectedCount > 0 ? this.getFigureInfoText(selectedFigures) : 'Выберите фигуру(ы) (Ctrl+клик для выбора вложенных)'}
                    </div>
                    <div id="operationHint" style="font-size: 11px; color: #888; margin: 5px 0;">
                        ${selectedCount > 0 ? this.getOperationHint() : ''}
                    </div>
                </div>
                <button id="performExtrude" class="btn-primary" ${selectedCount > 0 ? '' : 'disabled'}>
                    <i class="fas fa-check"></i> ${this.getOperationButtonText()}
                </button>
            </div>
            <div class="extrude-hint">
                <i class="fas fa-info-circle"></i>
                <div>• Клик по внешней фигуре: вытягивание со всеми отверстиями</div>
                <div>• Клик по внутренней фигуре: вытягивание только внутренней фигуры</div>
                <div>• Ctrl+клик: множественный выбор фигур</div>
                <div>• Если выделена внешняя фигура и через Ctrl выделены отверстия, они исключаются из вытягивания</div>
                <div>• Перетаскивайте стрелку для изменения высоты</div>
            </div>
        `;

        document.querySelector('.viewport-container').appendChild(container);

        container.querySelector('#cancelExtrude').addEventListener('click', () => {
            this.cancelExtrudeMode();
        });

        container.querySelector('#performExtrude').addEventListener('click', () => {
            this.performExtrude();
        });

        const heightInput = container.querySelector('#extrudeHeight');
        heightInput.addEventListener('input', (e) => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
            
            const btn = document.querySelector('#performExtrude');
            if (btn && !btn.disabled) {
                const height = parseFloat(e.target.value) || 10;
                btn.innerHTML = `<i class="fas fa-check"></i> ${this.getOperationButtonText(height)}`;
            }
        });

        const directionSelect = container.querySelector('#extrudeDirection');
        directionSelect.addEventListener('change', () => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
        });

        const operationSelect = container.querySelector('#extrudeOperation');
        operationSelect.addEventListener('change', () => {
            this.currentOperation = operationSelect.value;
            this.updateOperationHint();
            this.updateExtrudeUI();
        });
    }

    getFigureInfoText(figures) {
        const figureCount = figures.length;
        let holeCount = 0;
        let externalCount = 0;
        let internalCount = 0;
        
        figures.forEach(fig => {
            if (fig.isHole) {
                internalCount++;
            } else {
                externalCount++;
                holeCount += fig.holes.length;
            }
        });
        
        let text = `✓ Выбрано фигур: ${figureCount}`;
        if (externalCount > 0) text += ` (внешних: ${externalCount})`;
        if (internalCount > 0) text += ` (внутренних: ${internalCount})`;
        if (holeCount > 0 && externalCount > 0) text += ` (отверстий в выбранных: ${holeCount})`;
        
        if (this.basePlane) {
            const planeName = this.basePlane.userData?.name || 'основной плоскости';
            text += ` на ${planeName}`;
        }
        
        return text;
    }

    getOperationHint() {
        const operation = document.getElementById('extrudeOperation')?.value || 'new';
        const hints = {
            'new': 'Создаст новый объект на базовой плоскости',
            'cut': 'Вырежет из пересекающихся объектов на базовой плоскости',
            'join': 'Объединит с пересекающихся объектов на базовой плоскости'
        };
        return hints[operation] || '';
    }

    getOperationButtonText(height = null) {
        const operation = document.getElementById('extrudeOperation')?.value || 'new';
        const selectedFigures = this.getSelectedFigures();
        const figureCount = selectedFigures.length;
        const heightStr = height ? `${height.toFixed(1)} мм` : '';

        const texts = {
            'new': `Создать ${figureCount > 1 ? `(${figureCount} фигур)` : ''} ${heightStr}`,
            'cut': `Вырезать ${figureCount > 1 ? `(${figureCount} фигур)` : ''} ${heightStr}`,
            'join': `Объединить ${figureCount > 1 ? `(${figureCount} фигур)` : ''} ${heightStr}`
        };

        return texts[operation] || 'Выполнить';
    }

    updateOperationHint() {
        const hintElement = document.getElementById('operationHint');
        if (hintElement) {
            hintElement.textContent = this.getOperationHint();
        }
    }

    updateExtrudeUI() {
        const selectedContourInfo = document.getElementById('selectedContourInfo');
        const performExtrudeBtn = document.getElementById('performExtrude');
        const operationHint = document.getElementById('operationHint');

        if (selectedContourInfo) {
            const selectedFigures = this.getSelectedFigures();
            const figureCount = selectedFigures.length;
            if (figureCount > 0) {
                selectedContourInfo.textContent = this.getFigureInfoText(selectedFigures);
                selectedContourInfo.style.color = '#4CAF50';
            } else {
                selectedContourInfo.textContent = 'Выберите фигуру(ы) (Ctrl+клик для выбора вложенных)';
                selectedContourInfo.style.color = '#888';
            }
        }

        if (operationHint) {
            operationHint.textContent = this.getOperationHint();
        }

        if (performExtrudeBtn) {
            const selectedFigures = this.getSelectedFigures();
            const figureCount = selectedFigures.length;
            performExtrudeBtn.disabled = figureCount === 0;

            if (figureCount > 0) {
                const height = document.getElementById('extrudeHeight')?.value || 10;
                performExtrudeBtn.innerHTML = `<i class="fas fa-check"></i> ${this.getOperationButtonText(parseFloat(height))}`;
            }
        }
    }

    // === МЕТОДЫ ВЫПОЛНЕНИЯ ВЫТЯГИВАНИЯ ===

    performExtrude() {
        const selectedFigures = this.getSelectedFigures();
        if (selectedFigures.length === 0) {
            this.editor.showStatus('Выберите фигуру(ы) для вытягивания', 'error');
            return;
        }

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';
        const operation = document.getElementById('extrudeOperation')?.value || 'new';

        if (isNaN(height)) {
            this.editor.showStatus('Введите корректную высоту', 'error');
            return;
        }

        if (!this.basePlane) {
            this.editor.showStatus('Не определена базовая плоскость', 'error');
            return;
        }

        const geometry = this.createExtrusionGeometryFromFigures(selectedFigures, height, direction);
        if (!geometry) {
            this.editor.showStatus('Не удалось создать геометрию выдавливания', 'error');
            return;
        }

        const mesh = this.createExtrusionMesh(geometry, height, direction, selectedFigures);
        if (!mesh) {
            this.editor.showStatus('Не удалось создать объект выдавливания', 'error');
            return;
        }

        const planeWorldPos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planeWorldPos);
        
        mesh.position.copy(planeWorldPos);
        mesh.quaternion.copy(this.basePlane.quaternion);

        const sourceFigureData = selectedFigures.map(figure => {
            const elements = [];
            if (figure.outer.element) elements.push(figure.outer.element);
            if (figure.outer.elements) elements.push(...figure.outer.elements);
            return elements.map(element => this.editor.projectManager.serializeObject(element));
        });

        const historyData = {
            sourceFigures: sourceFigureData,
            sketchPlane: this.editor.projectManager.serializeObject(this.basePlane),
            height: height,
            direction: direction,
            operation: operation
        };

        switch (operation) {
            case 'new':
                this.handleNewOperation(mesh, historyData);
                break;
            case 'cut':
                this.handleCutOperation(mesh, historyData);
                break;
            case 'join':
                this.handleJoinOperation(mesh, historyData);
                break;
        }

        this.cancelExtrudeMode();
        this.editor.showStatus(`Выполнено выдавливание (${height} мм)`, 'success');
    }

    createExtrusionMesh(geometry, height, direction, sourceFigures) {
        if (!geometry) return null;

        const material = new THREE.MeshPhongMaterial({
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.userData = {
            type: 'extrusion',
            sourceFigureIds: sourceFigures.map(f => f.id),
            height: height,
            direction: direction,
            operation: this.currentOperation,
            name: `Вытягивание (${height} мм)`,
            figureCount: sourceFigures.length,
            holeCount: sourceFigures.reduce((sum, fig) => sum + (fig.holes ? fig.holes.length : 0), 0),
            basePlaneId: this.basePlane?.uuid,
            createdAt: new Date().toISOString()
        };

        return mesh;
    }

    handleNewOperation(mesh, historyData) {
        const finalPosition = mesh.position.clone();
        const finalScale = mesh.scale.clone();

        this.editor.objectsGroup.add(mesh);
        this.editor.objects.push(mesh);

        this.editor.selectObject(mesh);

        const serializedMesh = this.editor.projectManager.serializeObjectForHistory(mesh);
        serializedMesh.userData.finalPosition = finalPosition.toArray();
        serializedMesh.userData.finalScale = finalScale.toArray();

        this.editor.history.addAction({
            type: 'create',
            subtype: 'extrude',
            object: mesh.uuid,
            data: {
                ...historyData,
                objectData: serializedMesh,
                finalPosition: finalPosition.toArray(),
                finalScale: finalScale.toArray()
            }
        });
    }

    handleCutOperation(mesh, historyData) {
        const intersectingObjects = this.findIntersectingObjects(mesh);

        if (intersectingObjects.length === 0) {
            this.editor.showStatus('Нет пересекающихся объектов для вырезания', 'warning');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        if (!this.editor.booleanOps) {
            this.editor.showStatus('Булевы операции не доступны', 'error');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        const targetObjectsData = intersectingObjects.map(obj => {
            return this.editor.projectManager.serializeObjectForHistory(obj);
        });

        let operationSuccess = false;
        let booleanResult = null;

        intersectingObjects.forEach(targetObject => {
            try {
                const result = this.editor.booleanOps.subtract(targetObject, mesh);
                if (result && result.geometry && result.geometry.attributes.position.count > 0) {
                    booleanResult = result;
                    this.replaceObjectWithResult(targetObject, result, 'cut', {
                        sourceExtrude: historyData,
                        targetObjectData: targetObjectsData
                    });
                    operationSuccess = true;
                }
            } catch (error) {
                console.error('Ошибка вырезания:', error);
            }
        });

        if (!operationSuccess) {
            this.editor.showStatus('Не удалось выполнить вырезание', 'error');
            this.handleNewOperation(mesh, historyData);
        }
    }

    handleJoinOperation(mesh, historyData) {
        const intersectingObjects = this.findIntersectingObjects(mesh);

        if (intersectingObjects.length === 0) {
            this.editor.showStatus('Нет пересекающихся объектов для соединения', 'warning');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        if (!this.editor.booleanOps) {
            this.editor.showStatus('Булевы операции не доступны', 'error');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        const objectsData = intersectingObjects.map(obj => {
            return this.editor.projectManager.serializeObjectForHistory(obj);
        });
        const extrudeData = this.editor.projectManager.serializeObjectForHistory(mesh);

        try {
            const objectsToUnion = [...intersectingObjects, mesh];
            const result = this.editor.booleanOps.unionMultiple(objectsToUnion);

            if (result && result.geometry && result.geometry.attributes.position.count > 0) {
                this.replaceObjectsWithResult(objectsToUnion, result, 'join', {
                    sourceObjectsData: objectsData,
                    extrudeData: extrudeData,
                    sourceExtrude: historyData
                });
            } else {
                throw new Error('Результат объединения пуст');
            }
        } catch (error) {
            console.error('Ошибка соединения:', error);
            this.editor.showStatus('Не удалось выполнить соединение', 'error');
            this.handleNewOperation(mesh, historyData);
        }
    }

    findIntersectingObjects(mesh) {
        const intersectingObjects = [];
        const bbox1 = new THREE.Box3().setFromObject(mesh);

        this.editor.objects.forEach(obj => {
            if (obj === mesh || obj.userData.type === 'sketch_plane' ||
                obj.userData.type === 'work_plane' ||
                obj.userData.type === 'sketch_element' ||
                obj.userData.type === 'extrusion') {
                return;
            }

            const bbox2 = new THREE.Box3().setFromObject(obj);
            if (bbox1.intersectsBox(bbox2)) {
                intersectingObjects.push(obj);
            }
        });

        return intersectingObjects;
    }

    replaceObjectWithResult(originalObject, result, operationType, historyContext) {
        const originalBox = new THREE.Box3().setFromObject(originalObject);
        const originalSize = new THREE.Vector3();
        originalBox.getSize(originalSize);

        const originalIndex = this.editor.objects.indexOf(originalObject);
        if (originalIndex > -1) {
            this.editor.objectsGroup.remove(originalObject);
            this.editor.objects.splice(originalIndex, 1);

            if (originalObject.geometry) originalObject.geometry.dispose();
            if (originalObject.material) originalObject.material.dispose();
        }

        result.userData = {
            ...result.userData,
            type: 'boolean_result',
            operation: operationType,
            originalObjects: [originalObject.uuid],
            createdAt: new Date().toISOString(),
            originalSize: originalSize.toArray(),
            originalPosition: originalObject.position.toArray()
        };

        this.editor.objectsGroup.add(result);
        this.editor.objects.push(result);

        this.editor.selectObject(result);

        this.editor.history.addAction({
            type: 'boolean',
            operation: 'subtract',
            result: result.uuid,
            sourceObjects: [originalObject.uuid],
            originalObjects: historyContext ? [{
                uuid: originalObject.uuid,
                data: historyContext.targetObjectData[0]
            }] : [],
            resultData: this.editor.projectManager.serializeObjectForHistory(result),
            context: historyContext?.sourceExtrude
        });
    }

    replaceObjectsWithResult(originalObjects, result, operationType, historyContext) {
        const originalData = originalObjects.map(obj => {
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);

            return {
                uuid: obj.uuid,
                position: obj.position.toArray(),
                size: size.toArray(),
                data: this.editor.projectManager.serializeObjectForHistory(obj)
            };
        });

        originalObjects.forEach(obj => {
            const index = this.editor.objects.indexOf(obj);
            if (index > -1) {
                this.editor.objectsGroup.remove(obj);
                this.editor.objects.splice(index, 1);

                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            }
        });

        result.userData = {
            ...result.userData,
            type: 'boolean_result',
            operation: operationType,
            originalObjects: originalObjects.map(o => o.uuid),
            createdAt: new Date().toISOString(),
            originalSizes: originalData.map(d => d.size),
            originalPositions: originalData.map(d => d.position)
        };

        this.editor.objectsGroup.add(result);
        this.editor.objects.push(result);

        this.editor.selectObject(result);

        this.editor.history.addAction({
            type: 'boolean',
            operation: 'union',
            result: result.uuid,
            sourceObjects: originalObjects.map(o => o.uuid),
            originalObjects: originalData.map(d => ({ uuid: d.uuid, data: d.data })),
            resultData: this.editor.projectManager.serializeObjectForHistory(result),
            context: historyContext?.sourceExtrude
        });
    }

    // === ЗАВЕРШЕНИЕ РЕЖИМА ВЫТЯГИВАНИЯ ===

    exitExtrudeMode() {
        this.editor.setCurrentTool('select');
    }

    cancelExtrudeMode() {
        this.clearFigureSelection();

        // Удаляем стрелку
        if (this.extrudeArrow) {
            if (this.extrudeArrow.parent) {
                this.extrudeArrow.parent.remove(this.extrudeArrow);
            }
            this.extrudeArrow = null;
            this.arrowHandle = null;
        }

        // Удаляем превью
        this.removeExtrudePreview();

        // Удаляем UI
        const ui = document.getElementById('extrudeUI');
        if (ui) ui.remove();

        // Восстанавливаем цвета всех элементов скетча
        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        allSketchElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        this.dragging = false;
        this.isDraggingArrow = false;
        this.basePlane = null;

        this.editor.showStatus('Режим выдавливания завершен', 'info');
    }

    // === ДЛЯ СОВМЕСТИМОСТИ СО СТАРЫМ КОДОМ ===

    highlightExtrudableContours() {
        this.highlightExtrudableFigures();
    }

    highlightExtrudableFigures() {
        const allElements = this.editor.objectsManager.getAllSketchElements();
        
        allElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });
        
        const figures = this.collectAllFigures();
        
        figures.forEach(figure => {
            if (figure.outer.element) {
                this.editor.objectsManager.safeSetElementColor(figure.outer.element, 0x2196F3);
            } else if (figure.outer.elements) {
                figure.outer.elements.forEach(element => {
                    this.editor.objectsManager.safeSetElementColor(element, 0x2196F3);
                });
            }
            
            figure.holes.forEach(hole => {
                if (hole.element) {
                    this.editor.objectsManager.safeSetElementColor(hole.element, 0xFF9800);
                } else if (hole.elements) {
                    hole.elements.forEach(element => {
                        this.editor.objectsManager.safeSetElementColor(element, 0xFF9800);
                    });
                }
            });
        });
        
        if (figures.length === 0) {
            this.editor.showStatus('Нет замкнутых фигур для вытягивания', 'warning');
        }
    }

    selectContourForExtrude(event) {
        return this.selectFigureForExtrude(event);
    }

    getSelectedContours() {
        const elements = [];
        this.selectedFigures.forEach(figure => {
            if (figure.outer.element) {
                elements.push(figure.outer.element);
            } else if (figure.outer.elements) {
                elements.push(...figure.outer.elements);
            }
            figure.holes.forEach(hole => {
                if (hole.element) {
                    elements.push(hole.element);
                } else if (hole.elements) {
                    elements.push(...hole.elements);
                }
            });
        });
        return elements;
    }
}