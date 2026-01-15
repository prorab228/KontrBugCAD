/**
 * Инструмент для экспорта скетча в векторные форматы (SVG, DXF, PDF)
 */
class ExportSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'export', 'fa-download');
    }

    onMouseDown(e) {
        // Показываем меню выбора формата экспорта
        this.showExportMenu(e);
        return true;
    }

    showExportMenu(e) {
        const menu = document.createElement('div');
        menu.className = 'export-menu';
        menu.style.cssText = `
            position: fixed;
            background: #2d2d2d;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 8px 0;
            min-width: 200px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 10000;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
        `;

        menu.innerHTML = `
            <div class="export-menu-header" style="padding: 8px 12px; border-bottom: 1px solid #444; color: #aaa;">
                Экспорт чертежа
            </div>
            <div class="export-option" data-format="svg" style="padding: 10px 12px; cursor: pointer; color: white; border-bottom: 1px solid #333;">
                <i class="fa fa-file-image" style="margin-right: 8px;"></i> SVG (векторный)
            </div>
            <div class="export-option" data-format="dxf" style="padding: 10px 12px; cursor: pointer; color: white; border-bottom: 1px solid #333;">
                <i class="fa fa-file-code" style="margin-right: 8px;"></i> DXF (AutoCAD)
            </div>
            <div class="export-option" data-format="json" style="padding: 10px 12px; cursor: pointer; color: white; border-bottom: 1px solid #333;">
                <i class="fa fa-file-alt" style="margin-right: 8px;"></i> JSON (структура)
            </div>
            <div class="export-option" data-format="pdf" style="padding: 10px 12px; cursor: pointer; color: white;">
                <i class="fa fa-file-pdf" style="margin-right: 8px;"></i> PDF (печать)
            </div>
        `;

        // Позиционируем меню рядом с курсором
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        document.body.appendChild(menu);

        // Обработчики выбора формата
        menu.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (event) => {
                const format = option.dataset.format;
                this.exportSketch(format);
                document.body.removeChild(menu);
                event.stopPropagation();
            });

            option.addEventListener('mouseenter', () => {
                option.style.background = '#3a3a3a';
            });

            option.addEventListener('mouseleave', () => {
                option.style.background = 'transparent';
            });
        });

        // Закрытие меню при клике вне его
        const closeMenu = (event) => {
            if (!menu.contains(event.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    exportSketch(format) {
        if (!this.sketchManager.currentSketch || this.sketchManager.elementManager.elements.length === 0) {
            this.sketchManager.editor.showStatus('Нет данных для экспорта', 'warning');
            return;
        }

        switch (format) {
            case 'svg':
                this.exportToSVG();
                break;
            case 'dxf':
                this.exportToDXF();
                break;
            case 'json':
                this.exportToJSON();
                break;
            case 'pdf':
                this.exportToPDF();
                break;
            default:
                this.sketchManager.editor.showStatus(`Формат ${format} не поддерживается`, 'error');
        }
    }

    exportToSVG() {
        // Вычисляем bounding box всех элементов
        const bbox = this.calculateBoundingBox();
        if (!bbox) {
            this.sketchManager.editor.showStatus('Не удалось вычислить границы чертежа', 'error');
            return;
        }

        // Добавляем отступы
        const padding = 10;
        const viewBox = {
            x: bbox.minX - padding,
            y: bbox.minY - padding,
            width: bbox.width + padding * 2,
            height: bbox.height + padding * 2
        };

        // Создаем SVG документ
        let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="${viewBox.width}mm" height="${viewBox.height}mm" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"
     xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1">

    <title>Чертеж ${this.sketchManager.currentSketch.name}</title>
    <desc>Экспортировано из CAD Editor</desc>

    <!-- Стили -->
    <style type="text/css">
        .sketch-element {
            stroke: #000000;
            stroke-width: 0.2;
            fill: none;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .sketch-text {
            font-family: Arial, sans-serif;
            font-size: 5mm;
            fill: #000000;
        }
    </style>

    <!-- Сетка (если видима) -->
    ${this.generateSVGGrid(viewBox)}

    <!-- Элементы чертежа -->
    ${this.generateSVGElements()}

</svg>`;

        this.downloadFile(svgContent, `${this.sketchManager.currentSketch.name}.svg`, 'image/svg+xml');
        this.sketchManager.editor.showStatus('Чертеж экспортирован в SVG', 'success');
    }

    exportToDXF() {
        // Генерируем DXF файл (упрощенная версия)
        let dxfContent = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1018
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
ENDSEC
0
SECTION
2
BLOCKS
0
ENDSEC
0
SECTION
2
ENTITIES
`;

        // Добавляем элементы
        this.sketchManager.elementManager.elements.forEach((element, index) => {
            dxfContent += this.generateDXFElement(element, index);
        });

        dxfContent += `0
ENDSEC
0
EOF`;

        this.downloadFile(dxfContent, `${this.sketchManager.currentSketch.name}.dxf`, 'application/dxf');
        this.sketchManager.editor.showStatus('Чертеж экспортирован в DXF', 'success');
    }

    exportToJSON() {
        const sketchData = {
            name: this.sketchManager.currentSketch.name,
            created: this.sketchManager.currentSketch.created,
            planeId: this.sketchManager.currentSketch.planeId,
            elements: this.sketchManager.elementManager.elements.map(element => ({
                type: element.type,
                color: element.color ? element.color.getHexString() : '000000',
                points: element.points ? element.points.map(p => ({ x: p.x, y: p.y, z: p.z })) : [],
                start: element.start ? { x: element.start.x, y: element.start.y, z: element.start.z } : null,
                end: element.end ? { x: element.end.x, y: element.end.y, z: element.end.z } : null,
                center: element.center ? { x: element.center.x, y: element.center.y, z: element.center.z } : null,
                radius: element.radius,
                width: element.width,
                height: element.height,
                segments: element.segments,
                sides: element.sides,
                content: element.content,
                fontSize: element.fontSize,
                cornerRadius: element.cornerRadius
            })),
            metadata: {
                exportedAt: new Date().toISOString(),
                exporter: 'CAD Editor',
                version: '1.0'
            }
        };

        const jsonContent = JSON.stringify(sketchData, null, 2);
        this.downloadFile(jsonContent, `${this.sketchManager.currentSketch.name}.json`, 'application/json');
        this.sketchManager.editor.showStatus('Чертеж экспортирован в JSON', 'success');
    }

    exportToPDF() {
        // Для PDF экспорта используем jsPDF (должен быть подключен в проекте)
        if (typeof window.jspdf === 'undefined') {
            this.sketchManager.editor.showStatus('Библиотека jsPDF не найдена', 'error');
            return;
        }

        const bbox = this.calculateBoundingBox();
        if (!bbox) return;

        // Создаем PDF документ
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: bbox.width > bbox.height ? 'landscape' : 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Вычисляем масштаб
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const scale = Math.min(pageWidth / bbox.width, pageHeight / bbox.height) * 0.8;

        // Смещение для центрирования
        const offsetX = (pageWidth - bbox.width * scale) / 2;
        const offsetY = (pageHeight - bbox.height * scale) / 2;

        // Добавляем заголовок
        pdf.setFontSize(12);
        pdf.text(`Чертеж: ${this.sketchManager.currentSketch.name}`, 10, 10);
        pdf.text(`Дата экспорта: ${new Date().toLocaleDateString()}`, 10, 16);

        // Рисуем элементы (упрощенно - только линии)
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.1);

        this.sketchManager.elementManager.elements.forEach(element => {
            if (element.type === 'line' && element.start && element.end) {
                const x1 = offsetX + (element.start.x - bbox.minX) * scale;
                const y1 = offsetY + (element.start.y - bbox.minY) * scale;
                const x2 = offsetX + (element.end.x - bbox.minX) * scale;
                const y2 = offsetY + (element.end.y - bbox.minY) * scale;

                pdf.line(x1, y1, x2, y2);
            }
        });

        pdf.save(`${this.sketchManager.currentSketch.name}.pdf`);
        this.sketchManager.editor.showStatus('Чертеж экспортирован в PDF', 'success');
    }

    calculateBoundingBox() {
        if (this.sketchManager.elementManager.elements.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.sketchManager.elementManager.elements.forEach(element => {
            // Обрабатываем точки в зависимости от типа элемента
            if (element.points && element.points.length > 0) {
                element.points.forEach(point => {
                    minX = Math.min(minX, point.x);
                    minY = Math.min(minY, point.y);
                    maxX = Math.max(maxX, point.x);
                    maxY = Math.max(maxY, point.y);
                });
            }

            if (element.start) {
                minX = Math.min(minX, element.start.x);
                minY = Math.min(minY, element.start.y);
                maxX = Math.max(maxX, element.start.x);
                maxY = Math.max(maxY, element.start.y);
            }

            if (element.end) {
                minX = Math.min(minX, element.end.x);
                minY = Math.min(minY, element.end.y);
                maxX = Math.max(maxX, element.end.x);
                maxY = Math.max(maxY, element.end.y);
            }

            if (element.center && element.radius) {
                minX = Math.min(minX, element.center.x - element.radius);
                minY = Math.min(minY, element.center.y - element.radius);
                maxX = Math.max(maxX, element.center.x + element.radius);
                maxY = Math.max(maxY, element.center.y + element.radius);
            }
        });

        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    generateSVGGrid(viewBox) {
        if (!this.sketchManager.gridVisible) return '';

        const gridSize = 50;
        const gridStep = 1;
        const divisions = gridSize / gridStep;

        let gridContent = '<!-- Сетка -->\n';
        gridContent += '<g stroke="#cccccc" stroke-width="0.05" stroke-opacity="0.3">\n';

        // Горизонтальные линии
        for (let i = -divisions; i <= divisions; i++) {
            const y = i * gridStep;
            const x1 = -gridSize;
            const x2 = gridSize;

            if (y >= viewBox.y && y <= viewBox.y + viewBox.height) {
                gridContent += `    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />\n`;
            }
        }

        // Вертикальные линии
        for (let i = -divisions; i <= divisions; i++) {
            const x = i * gridStep;
            const y1 = -gridSize;
            const y2 = gridSize;

            if (x >= viewBox.x && x <= viewBox.x + viewBox.width) {
                gridContent += `    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" />\n`;
            }
        }

        gridContent += '</g>\n';

        // Центральные оси
        gridContent += '<g stroke="#666666" stroke-width="0.1">\n';
        gridContent += `    <line x1="${viewBox.x}" y1="0" x2="${viewBox.x + viewBox.width}" y2="0" />\n`;
        gridContent += `    <line x1="0" y1="${viewBox.y}" x2="0" y2="${viewBox.y + viewBox.height}" />\n`;
        gridContent += '</g>\n';

        return gridContent;
    }

    generateSVGElements() {
        let svgElements = '';

        this.sketchManager.elementManager.elements.forEach((element, index) => {
            const elementId = `element-${index}`;

            switch (element.type) {
                case 'line':
                    if (element.start && element.end) {
                        svgElements += `    <line id="${elementId}" class="sketch-element" x1="${element.start.x}" y1="${element.start.y}" x2="${element.end.x}" y2="${element.end.y}" />\n`;
                    }
                    break;

                case 'rectangle':
                    if (element.points && element.points.length >= 4) {
                        const points = element.points.map(p => `${p.x},${p.y}`).join(' ');
                        svgElements += `    <polygon id="${elementId}" class="sketch-element" points="${points}" />\n`;
                    }
                    break;

                case 'circle':
                    if (element.center && element.radius !== undefined) {
                        svgElements += `    <circle id="${elementId}" class="sketch-element" cx="${element.center.x}" cy="${element.center.y}" r="${element.radius}" />\n`;
                    }
                    break;

                case 'polygon':
                case 'polyline':
                    if (element.points && element.points.length > 0) {
                        const points = element.points.map(p => `${p.x},${p.y}`).join(' ');
                        const tag = element.type === 'polygon' ? 'polygon' : 'polyline';
                        svgElements += `    <${tag} id="${elementId}" class="sketch-element" points="${points}" />\n`;
                    }
                    break;

                case 'oval':
                    if (element.center && element.radiusX !== undefined && element.radiusY !== undefined) {
                        svgElements += `    <ellipse id="${elementId}" class="sketch-element" cx="${element.center.x}" cy="${element.center.y}" rx="${element.radiusX}" ry="${element.radiusY}" />\n`;
                    }
                    break;

                case 'text':
                    if (element.position && element.content) {
                        svgElements += `    <text id="${elementId}" class="sketch-text" x="${element.position.x}" y="${element.position.y + (element.fontSize || 5)}">${element.content}</text>\n`;
                    }
                    break;

                case 'arc':
                    if (element.points && element.points.length > 0) {
                        const points = element.points.map(p => `${p.x},${p.y}`).join(' ');
                        svgElements += `    <polyline id="${elementId}" class="sketch-element" points="${points}" />\n`;
                    }
                    break;

                case 'curve':
                    if (element.curvePoints && element.curvePoints.length > 0) {
                        const points = element.curvePoints.map(p => `${p.x},${p.y}`).join(' ');
                        svgElements += `    <polyline id="${elementId}" class="sketch-element" points="${points}" />\n`;
                    }
                    break;
            }
        });

        return svgElements;
    }

    generateDXFElement(element, index) {
        // Упрощенная генерация DXF элементов
        let dxfElement = '';

        switch (element.type) {
            case 'line':
                if (element.start && element.end) {
                    dxfElement = `0
LINE
8
0
10
${element.start.x}
20
${element.start.y}
30
0
11
${element.end.x}
21
${element.end.y}
31
0
`;
                }
                break;

            case 'circle':
                if (element.center && element.radius !== undefined) {
                    dxfElement = `0
CIRCLE
8
0
10
${element.center.x}
20
${element.center.y}
30
0
40
${element.radius}
`;
                }
                break;
        }

        return dxfElement;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }

    onCancel() {
        // Ничего не делаем при отмене
    }
}