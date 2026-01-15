/**
 * Менеджер контуров скетча
 */
class SketchContourManager {
    constructor(sketchManager) {
        this.sketchManager = sketchManager;
        this.contourDetector = new ContourDetector();
        this.autoDetectContours = false;
        this.contourVisualization = null;
    }

    /**
     * Детекция контуров в скетче
     */
    detectContours() {
        if (!this.sketchManager.currentPlane || !this.autoDetectContours) return;

        const meshesOnPlane = [];

        // Собираем все элементы на плоскости
        this.sketchManager.currentPlane.traverse((child) => {
            if (child.userData && child.userData.type === 'sketch_element') {
                meshesOnPlane.push(child);
            }
        });

        this.detectContoursInSketch(this.sketchManager.currentPlane, meshesOnPlane);
    }

    /**
     * Принудительное обновление контуров после изменений
     */
    forceUpdateContours() {
        if (!this.sketchManager.currentPlane) return;

        // Очищаем предыдущую визуализацию
        this.removeContourVisualization();

        // Собираем все элементы на плоскости
        const meshesOnPlane = [];
        this.sketchManager.currentPlane.traverse((child) => {
            if (child.userData && child.userData.type === 'sketch_element') {
                meshesOnPlane.push(child);
            }
        });

        // Обновляем детектор
        this.contourDetector.updateElements(meshesOnPlane);

        // Находим контуры
        const contours = this.contourDetector.findClosedContours();

        // Обновляем FigureManager
        if (contours.length > 0) {
            this.updateFigureManagerWithContours(contours);
        }

        // Визуализируем для отладки
        if (this.autoDetectContours) {
            this.visualizeContours(contours);
        }
    }

    /**
     * Детекция контуров в указанном скетче
     */
    detectContoursInSketch(plane, elements = null) {
        if (!plane || !this.autoDetectContours) return;

        try {
            // Собираем все элементы на указанной плоскости
            const elementsOnPlane = elements || [];
            if (elementsOnPlane.length === 0) {
                plane.traverse((child) => {
                    if (child.userData && child.userData.type === 'sketch_element') {
                        elementsOnPlane.push(child);
                    }
                });
            }

            if (elementsOnPlane.length === 0) {
                return;
            }

            // Обновляем детектор контуров элементами этой плоскости
            this.contourDetector.updateElements(elementsOnPlane);

            // Находим все замкнутые контуры
            const contours = this.contourDetector.findClosedContours();

            if (contours.length > 0) {
                // Преобразуем контуры в формат для FigureManager
                const figureContours = contours.map((contour, index) => {
                    if (!contour.isValid || !contour.points || contour.points.length < 3) {
                        return null;
                    }

                    const area = Math.abs(this.calculatePolygonArea(contour.points));
                    if (area < 0.01) return null;

                    const center = this.calculateContourCenter(contour.points);
                    const boundingBox = this.calculateBoundingBox(contour.points);

                    return {
                        elements: contour.elements || [],
                        points: contour.points,
                        area: area,
                        center: center,
                        boundingBox: boundingBox,
                        type: 'auto_detected',
                        isClosed: true,
                        isClockwise: contour.isClockwise || false,
                        source: 'auto_detection',
                        planeId: plane.uuid
                    };
                }).filter(contour => contour !== null);

                // Обновляем FigureManager
                if (figureContours.length > 0) {
                    this.updateFigureManagerWithContours(figureContours, plane.uuid);

                    // Визуализируем для отладки
                    this.visualizeContours(figureContours);
                }
            }

        } catch (error) {
            console.error("Ошибка детекции контуров:", error);
        }
    }

    /**
     * Обновление FigureManager с контурами
     */
    updateFigureManagerWithContours(contours = null, planeId = null) {
        const figureManager = this.sketchManager.editor.objectsManager.figureManager;

        if (!figureManager) {
            console.error("FigureManager не найден!");
            return;
        }

        // Если контуры не переданы, получаем их из детектора
        if (!contours && this.contourDetector) {
            contours = this.contourDetector.findClosedContours();
        }

        if (!contours || contours.length === 0) return;

        // Фильтруем контуры по плоскости
        let filteredContours = contours;
        if (planeId) {
            filteredContours = contours.filter(contour =>
                contour.planeId === planeId ||
                (contour.elements && contour.elements.some(el => {
                    if (el.parent && el.parent.uuid === planeId) return true;
                    if (el.userData && el.userData.sketchPlaneId === planeId) return true;
                    return false;
                }))
            );
        }

        // Обновляем фигуры в FigureManager
        figureManager.updateWithAutoContours(filteredContours);
    }

    /**
     * Визуализация контуров (для отладки)
     */
    visualizeContours(contours) {
        this.removeContourVisualization();

        // Создаем группу для визуализации
        this.contourVisualization = new THREE.Group();
        this.contourVisualization.name = 'contour_debug';

        // Для каждого контура создаем линию
        contours.forEach((contour, index) => {
            if (!contour.points || contour.points.length < 3) return;

            // Создаем геометрию из точек
            const vertices = [];
            contour.points.forEach(point => {
                vertices.push(point.x, point.y, 0.1);
            });

            // Добавляем первую точку в конец для замыкания
            const firstPoint = contour.points[0];
            vertices.push(firstPoint.x, firstPoint.y, 0.1);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

            // Случайный цвет для каждого контура
            const hue = (index * 137.5) % 360;
            const color = new THREE.Color().setHSL(hue / 360, 0.8, 0.6);

            const material = new THREE.LineBasicMaterial({
                color: color,
                linewidth: 3,
                transparent: true,
                opacity: 0.7
            });

            const line = new THREE.Line(geometry, material);
            line.userData.isContourDebug = true;
            line.userData.contourId = contour.id;

            this.contourVisualization.add(line);
        });

        // Добавляем визуализацию на плоскость скетча
        if (this.sketchManager.currentPlane) {
            this.sketchManager.currentPlane.add(this.contourVisualization);
        }
    }

    /**
     * Удаление визуализации контуров
     */
    removeContourVisualization() {
        if (this.contourVisualization && this.sketchManager.currentPlane) {
            this.sketchManager.currentPlane.remove(this.contourVisualization);
            this.contourVisualization.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.contourVisualization = null;
        }
    }

    /**
     * Расчет площади полигона
     */
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

    /**
     * Расчет центра контура
     */
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

    /**
     * Расчет ограничивающего прямоугольника
     */
    calculateBoundingBox(points) {
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

    /**
     * Обновление контуров из элементов
     */
    updateContoursFromElements() {
        if (!this.sketchManager.currentPlane ||
            !this.sketchManager.elementManager.elements.length) return;

        // Собираем все элементы
        const allMeshes = this.sketchManager.elementManager.elements.map(el => el.mesh);

        // Обновляем детектор контуров
        this.contourDetector.updateElements(allMeshes);

        // Находим все замкнутые контуры
        const contours = this.contourDetector.findClosedContours();

        // Обновляем FigureManager с найденными контурами
        this.updateFigureManagerWithContours(contours);
    }

    /**
     * Очистка ресурсов
     */
    clear() {
        this.removeContourVisualization();
        this.contourDetector.clear();
        this.autoDetectContours = false;
    }
}