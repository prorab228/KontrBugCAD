/**
 * Инструмент для импорта скетчей из векторных форматов
 */
class ImportSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'import', 'fa-upload');
        this.fileInput = null;
        this.supportedFormats = {
            'image/svg+xml': 'svg',
            'application/dxf': 'dxf',
            'application/json': 'json',
            'text/xml': 'svg',
            'application/pdf': 'pdf'
        };
    }

    onMouseDown(e) {
        // Создаем и показываем файловый input
        this.showFileInput();
        return true;
    }

    showFileInput() {
        if (this.fileInput && this.fileInput.parentNode) {
            this.fileInput.parentNode.removeChild(this.fileInput);
        }

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.svg,.dxf,.json,.pdf';
        this.fileInput.style.display = 'none';
        this.fileInput.multiple = false;

        this.fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.processFile(file);
            }

            // Очищаем input для возможности повторной загрузки того же файла
            this.fileInput.value = '';
        };

        document.body.appendChild(this.fileInput);
        this.fileInput.click();
    }

    processFile(file) {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const mimeType = file.type;

        this.sketchManager.editor.showStatus(`Загружается файл: ${file.name}`, 'info');

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const content = e.target.result;

                switch (fileExtension) {
                    case 'svg':
                        this.importSVG(content, file.name);
                        break;
                    case 'dxf':
                        this.importDXF(content, file.name);
                        break;
                    case 'json':
                        this.importJSON(content, file.name);
                        break;
                    default:
                        this.sketchManager.editor.showStatus(`Формат ${fileExtension} не поддерживается`, 'error');
                }
            } catch (error) {
                console.error('Ошибка при импорте файла:', error);
                this.sketchManager.editor.showStatus(`Ошибка импорта: ${error.message}`, 'error');
            }
        };

        reader.onerror = () => {
            this.sketchManager.editor.showStatus('Ошибка чтения файла', 'error');
        };

        if (fileExtension === 'svg' || fileExtension === 'dxf' || fileExtension === 'json') {
            reader.readAsText(file);
        } else {
            this.sketchManager.editor.showStatus(`Формат ${fileExtension} не поддерживается`, 'error');
        }
    }

    importSVG(svgContent, filename) {
        try {
            // Парсим SVG XML
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');

            if (svgDoc.querySelector('parsererror')) {
                throw new Error('Некорректный SVG файл');
            }

            const svgElements = svgDoc.querySelectorAll('line, rect, circle, ellipse, polygon, polyline, path, text');

            if (svgElements.length === 0) {
                this.sketchManager.editor.showStatus('SVG файл не содержит векторных элементов', 'warning');
                return;
            }

            let importedCount = 0;
            const centerX = 0, centerY = 0; // Центр плоскости

            svgElements.forEach((svgElement, index) => {
                const element = this.convertSVGToSketchElement(svgElement, centerX, centerY);
                if (element) {
                    this.sketchManager.addElement(element);
                    importedCount++;
                }
            });

            this.sketchManager.editor.showStatus(`Импортировано ${importedCount} элементов из SVG`, 'success');

        } catch (error) {
            console.error('Ошибка парсинга SVG:', error);
            this.sketchManager.editor.showStatus(`Ошибка импорта SVG: ${error.message}`, 'error');
        }
    }

    convertSVGToSketchElement(svgElement, offsetX, offsetY) {
        const tagName = svgElement.tagName.toLowerCase();

        try {
            switch (tagName) {
                case 'line':
                    return this.convertSVGLine(svgElement, offsetX, offsetY);
                case 'rect':
                    return this.convertSVGRect(svgElement, offsetX, offsetY);
                case 'circle':
                    return this.convertSVGCircle(svgElement, offsetX, offsetY);
                case 'ellipse':
                    return this.convertSVGEllipse(svgElement, offsetX, offsetY);
                case 'polygon':
                case 'polyline':
                    return this.convertSVGPoly(svgElement, offsetX, offsetY, tagName);
                case 'path':
                    return this.convertSVGPath(svgElement, offsetX, offsetY);
                case 'text':
                    return this.convertSVGText(svgElement, offsetX, offsetY);
                default:
                    return null;
            }
        } catch (error) {
            console.warn(`Не удалось конвертировать элемент ${tagName}:`, error);
            return null;
        }
    }

    convertSVGLine(svgElement, offsetX, offsetY) {
        const x1 = parseFloat(svgElement.getAttribute('x1') || 0) + offsetX;
        const y1 = -parseFloat(svgElement.getAttribute('y1') || 0) + offsetY; // Инвертируем Y
        const x2 = parseFloat(svgElement.getAttribute('x2') || 0) + offsetX;
        const y2 = -parseFloat(svgElement.getAttribute('y2') || 0) + offsetY; // Инвертируем Y

        return {
            type: 'line',
            start: new THREE.Vector3(x1, y1, 0),
            end: new THREE.Vector3(x2, y2, 0),
            points: [
                new THREE.Vector3(x1, y1, 0),
                new THREE.Vector3(x2, y2, 0)
            ],
            color: this.sketchManager.sketchColor
        };
    }

    convertSVGRect(svgElement, offsetX, offsetY) {
        const x = parseFloat(svgElement.getAttribute('x') || 0) + offsetX;
        const y = -parseFloat(svgElement.getAttribute('y') || 0) + offsetY; // Инвертируем Y
        const width = parseFloat(svgElement.getAttribute('width') || 0);
        const height = parseFloat(svgElement.getAttribute('height') || 0);

        const points = [
            new THREE.Vector3(x, y - height, 0), // Левый нижний
            new THREE.Vector3(x + width, y - height, 0), // Правый нижний
            new THREE.Vector3(x + width, y, 0), // Правый верхний
            new THREE.Vector3(x, y, 0), // Левый верхний
            new THREE.Vector3(x, y - height, 0) // Замыкаем
        ];

        return {
            type: 'rectangle',
            start: points[0].clone(),
            end: points[2].clone(),
            width: width,
            height: height,
            points: points,
            color: this.sketchManager.sketchColor
        };
    }

    convertSVGCircle(svgElement, offsetX, offsetY) {
        const cx = parseFloat(svgElement.getAttribute('cx') || 0) + offsetX;
        const cy = -parseFloat(svgElement.getAttribute('cy') || 0) + offsetY; // Инвертируем Y
        const r = parseFloat(svgElement.getAttribute('r') || 0);

        return {
            type: 'circle',
            center: new THREE.Vector3(cx, cy, 0),
            radius: r,
            diameter: r * 2,
            segments: 32,
            points: this.calculateCirclePoints(cx, cy, r, 32),
            color: this.sketchManager.sketchColor
        };
    }

    convertSVGEllipse(svgElement, offsetX, offsetY) {
        const cx = parseFloat(svgElement.getAttribute('cx') || 0) + offsetX;
        const cy = -parseFloat(svgElement.getAttribute('cy') || 0) + offsetY; // Инвертируем Y
        const rx = parseFloat(svgElement.getAttribute('rx') || 0);
        const ry = parseFloat(svgElement.getAttribute('ry') || 0);

        return {
            type: 'oval',
            center: new THREE.Vector3(cx, cy, 0),
            radiusX: rx,
            radiusY: ry,
            segments: 32,
            points: this.calculateOvalPoints(cx, cy, rx, ry, 32),
            color: this.sketchManager.sketchColor
        };
    }

    convertSVGPoly(svgElement, offsetX, offsetY, tagName) {
        const pointsStr = svgElement.getAttribute('points');
        if (!pointsStr) return null;

        const pointsArray = pointsStr.trim().split(/[\s,]+/);
        const points = [];

        for (let i = 0; i < pointsArray.length; i += 2) {
            const x = parseFloat(pointsArray[i]) + offsetX;
            const y = -parseFloat(pointsArray[i + 1]) + offsetY; // Инвертируем Y
            points.push(new THREE.Vector3(x, y, 0));
        }

        return {
            type: tagName === 'polygon' ? 'polygon' : 'polyline',
            points: points,
            color: this.sketchManager.sketchColor
        };
    }

    convertSVGPath(svgElement, offsetX, offsetY) {
        // Упрощенная конвертация path в полилинию
        const d = svgElement.getAttribute('d');
        if (!d) return null;

        // Простой парсинг только для команд M, L, C, Q
        const commands = d.match(/[MLCQ][^MLCQ]*/gi);
        if (!commands) return null;

        const points = [];

        commands.forEach(command => {
            const type = command[0];
            const coords = command.substring(1).trim().split(/[\s,]+/).map(Number);

            switch (type.toUpperCase()) {
                case 'M': // Move to
                case 'L': // Line to
                    if (coords.length >= 2) {
                        const x = coords[0] + offsetX;
                        const y = -coords[1] + offsetY; // Инвертируем Y
                        points.push(new THREE.Vector3(x, y, 0));
                    }
                    break;

                case 'C': // Cubic Bezier
                    if (coords.length >= 6) {
                        // Аппроксимируем кривую Безье отрезками
                        const start = points[points.length - 1] || new THREE.Vector3(0, 0, 0);
                        const cp1 = new THREE.Vector3(coords[0] + offsetX, -coords[1] + offsetY, 0);
                        const cp2 = new THREE.Vector3(coords[2] + offsetX, -coords[3] + offsetY, 0);
                        const end = new THREE.Vector3(coords[4] + offsetX, -coords[5] + offsetY, 0);

                        const bezierPoints = this.approximateBezier(start, cp1, cp2, end, 10);
                        points.push(...bezierPoints.slice(1)); // Добавляем без первой точки (она уже есть)
                    }
                    break;
            }
        });

        if (points.length < 2) return null;

        return {
            type: 'polyline',
            points: points,
            color: this.sketchManager.sketchColor
        };
    }

    convertSVGText(svgElement, offsetX, offsetY) {
        const x = parseFloat(svgElement.getAttribute('x') || 0) + offsetX;
        const y = -parseFloat(svgElement.getAttribute('y') || 0) + offsetY; // Инвертируем Y
        const textContent = svgElement.textContent || svgElement.text || '';

        if (!textContent.trim()) return null;

        // Получаем размер шрифта
        const style = svgElement.getAttribute('style') || '';
        const fontSizeMatch = style.match(/font-size:\s*([\d.]+)(mm|px|pt)/i);
        let fontSize = 5; // Значение по умолчанию

        if (fontSizeMatch) {
            fontSize = parseFloat(fontSizeMatch[1]);
            if (fontSizeMatch[2] === 'mm') {
                // Уже в мм
            } else if (fontSizeMatch[2] === 'px') {
                fontSize = fontSize * 0.264583; // px to mm
            } else if (fontSizeMatch[2] === 'pt') {
                fontSize = fontSize * 0.352778; // pt to mm
            }
        }

        return {
            type: 'text',
            position: new THREE.Vector3(x, y, 0),
            content: textContent,
            fontSize: fontSize,
            color: this.sketchManager.sketchColor,
            contours: this.generateSimpleTextContours(textContent, x, y, fontSize)
        };
    }

    importDXF(dxfContent, filename) {
        try {
            // Упрощенный парсинг DXF (только для демонстрации)
            // В реальном приложении нужна полноценная библиотека для парсинга DXF
            const lines = dxfContent.split('\n');
            const elements = [];
            let currentElement = null;

            for (let i = 0; i < lines.length; i++) {
                const code = lines[i].trim();
                const value = lines[i + 1] ? lines[i + 1].trim() : '';

                if (code === '0' && value === 'LINE') {
                    if (currentElement) elements.push(currentElement);
                    currentElement = { type: 'line', start: null, end: null };
                } else if (code === '0' && value === 'CIRCLE') {
                    if (currentElement) elements.push(currentElement);
                    currentElement = { type: 'circle', center: null, radius: 0 };
                } else if (code === '0' && value === 'ARC') {
                    if (currentElement) elements.push(currentElement);
                    currentElement = { type: 'arc', center: null, radius: 0 };
                } else if (code === '10' && currentElement) {
                    // X coordinate
                    const x = parseFloat(value);
                    if (currentElement.type === 'line') {
                        if (!currentElement.start) {
                            currentElement.start = { x: x, y: 0 };
                        } else {
                            currentElement.end = { x: x, y: currentElement.end?.y || 0 };
                        }
                    } else if (currentElement.type === 'circle' || currentElement.type === 'arc') {
                        if (!currentElement.center) {
                            currentElement.center = { x: x, y: 0 };
                        }
                    }
                } else if (code === '20' && currentElement) {
                    // Y coordinate
                    const y = parseFloat(value);
                    if (currentElement.type === 'line') {
                        if (currentElement.start && currentElement.start.y === undefined) {
                            currentElement.start.y = y;
                        } else if (currentElement.end) {
                            currentElement.end.y = y;
                        }
                    } else if (currentElement.type === 'circle' || currentElement.type === 'arc') {
                        if (currentElement.center) {
                            currentElement.center.y = y;
                        }
                    }
                } else if (code === '40' && currentElement && (currentElement.type === 'circle' || currentElement.type === 'arc')) {
                    currentElement.radius = parseFloat(value);
                }
            }

            if (currentElement) elements.push(currentElement);

            // Конвертируем в элементы скетча
            let importedCount = 0;
            elements.forEach(dxfElement => {
                const element = this.convertDXFToSketchElement(dxfElement);
                if (element) {
                    this.sketchManager.addElement(element);
                    importedCount++;
                }
            });

            this.sketchManager.editor.showStatus(`Импортировано ${importedCount} элементов из DXF`, 'success');

        } catch (error) {
            console.error('Ошибка парсинга DXF:', error);
            this.sketchManager.editor.showStatus('Ошибка импорта DXF файла. Формат может быть неподдерживаемым.', 'error');
        }
    }

    convertDXFToSketchElement(dxfElement) {
        switch (dxfElement.type) {
            case 'line':
                if (dxfElement.start && dxfElement.end) {
                    return {
                        type: 'line',
                        start: new THREE.Vector3(dxfElement.start.x, -dxfElement.start.y, 0), // Инвертируем Y
                        end: new THREE.Vector3(dxfElement.end.x, -dxfElement.end.y, 0),
                        points: [
                            new THREE.Vector3(dxfElement.start.x, -dxfElement.start.y, 0),
                            new THREE.Vector3(dxfElement.end.x, -dxfElement.end.y, 0)
                        ],
                        color: this.sketchManager.sketchColor
                    };
                }
                break;

            case 'circle':
                if (dxfElement.center && dxfElement.radius) {
                    return {
                        type: 'circle',
                        center: new THREE.Vector3(dxfElement.center.x, -dxfElement.center.y, 0), // Инвертируем Y
                        radius: dxfElement.radius,
                        diameter: dxfElement.radius * 2,
                        segments: 32,
                        points: this.calculateCirclePoints(dxfElement.center.x, -dxfElement.center.y, dxfElement.radius, 32),
                        color: this.sketchManager.sketchColor
                    };
                }
                break;
        }

        return null;
    }

    importJSON(jsonContent, filename) {
        try {
            const sketchData = JSON.parse(jsonContent);

            if (!sketchData.elements || !Array.isArray(sketchData.elements)) {
                throw new Error('Некорректный формат JSON файла');
            }

            let importedCount = 0;
            sketchData.elements.forEach(elementData => {
                const element = this.convertJSONToSketchElement(elementData);
                if (element) {
                    this.sketchManager.addElement(element);
                    importedCount++;
                }
            });

            // Обновляем информацию о скетче
            if (sketchData.name) {
                this.sketchManager.currentSketch.name = sketchData.name;
            }

            this.sketchManager.editor.showStatus(`Импортировано ${importedCount} элементов из JSON`, 'success');

        } catch (error) {
            console.error('Ошибка парсинга JSON:', error);
            this.sketchManager.editor.showStatus(`Ошибка импорта JSON: ${error.message}`, 'error');
        }
    }

    convertJSONToSketchElement(jsonData) {
        const element = {
            type: jsonData.type,
            color: this.sketchManager.sketchColor
        };

        // Восстанавливаем точки
        if (jsonData.points && Array.isArray(jsonData.points)) {
            element.points = jsonData.points.map(p => new THREE.Vector3(p.x, p.y, p.z || 0));
        }

        // Восстанавливаем другие свойства
        if (jsonData.start) element.start = new THREE.Vector3(jsonData.start.x, jsonData.start.y, jsonData.start.z || 0);
        if (jsonData.end) element.end = new THREE.Vector3(jsonData.end.x, jsonData.end.y, jsonData.end.z || 0);
        if (jsonData.center) element.center = new THREE.Vector3(jsonData.center.x, jsonData.center.y, jsonData.center.z || 0);

        // Копируем числовые свойства
        const numericProps = ['radius', 'width', 'height', 'segments', 'sides', 'fontSize', 'cornerRadius'];
        numericProps.forEach(prop => {
            if (jsonData[prop] !== undefined) element[prop] = jsonData[prop];
        });

        // Текст
        if (jsonData.content) element.content = jsonData.content;

        return element;
    }

    // Вспомогательные методы
    calculateCirclePoints(cx, cy, radius, segments) {
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = cx + Math.cos(theta) * radius;
            const y = cy + Math.sin(theta) * radius;
            points.push(new THREE.Vector3(x, y, 0));
        }
        return points;
    }

    calculateOvalPoints(cx, cy, rx, ry, segments) {
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = cx + Math.cos(theta) * rx;
            const y = cy + Math.sin(theta) * ry;
            points.push(new THREE.Vector3(x, y, 0));
        }
        return points;
    }

    approximateBezier(p0, p1, p2, p3, segments) {
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = Math.pow(1 - t, 3) * p0.x + 3 * Math.pow(1 - t, 2) * t * p1.x +
                      3 * (1 - t) * Math.pow(t, 2) * p2.x + Math.pow(t, 3) * p3.x;
            const y = Math.pow(1 - t, 3) * p0.y + 3 * Math.pow(1 - t, 2) * t * p1.y +
                      3 * (1 - t) * Math.pow(t, 2) * p2.y + Math.pow(t, 3) * p3.y;
            points.push(new THREE.Vector3(x, y, 0));
        }
        return points;
    }

    generateSimpleTextContours(text, x, y, fontSize) {
        const contours = [];
        const charWidth = fontSize * 0.6;
        const spacing = fontSize * 0.1;

        for (let i = 0; i < text.length; i++) {
            const charX = x + i * (charWidth + spacing);
            const charY = y;

            const points = [
                new THREE.Vector3(charX, charY, 0),
                new THREE.Vector3(charX + charWidth, charY, 0),
                new THREE.Vector3(charX + charWidth, charY + fontSize, 0),
                new THREE.Vector3(charX, charY + fontSize, 0),
                new THREE.Vector3(charX, charY, 0)
            ];

            contours.push(points);
        }

        return contours;
    }

    onCancel() {
        // Удаляем файловый input при отмене
        if (this.fileInput && this.fileInput.parentNode) {
            this.fileInput.parentNode.removeChild(this.fileInput);
            this.fileInput = null;
        }
    }
}