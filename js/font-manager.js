/**
 * Менеджер шрифтов для генерации контуров текста
 */
class FontManager {
    constructor() {
        this.font = null;
        this.fonts = {
            'Arial': null,
            'Times New Roman': null,
            'Verdana': null
        };

        this.init();
    }

    async init() {
        try {
            // Загружаем базовый шрифт (встроенный пример)
            this.loadDefaultFont();
        } catch (error) {
            console.error('Ошибка загрузки шрифтов:', error);
        }
    }

    loadDefaultFont() {
        // Создаем простой векторный шрифт для демонстрации
        // В реальном приложении здесь должна быть загрузка TTF/OTF файла
        this.createBasicFont();
    }

    createBasicFont() {
        // Простая векторная модель для каждого символа
        this.fonts['Basic'] = {
            getPath: function(text, x, y, fontSize) {
                const paths = [];
                let currentX = x;

                for (let char of text) {
                    const charWidth = fontSize * 0.6;
                    const contours = this.getCharContour(char, currentX, y, fontSize);

                    paths.push({
                        contours: contours,
                        x: currentX,
                        y: y,
                        width: charWidth,
                        height: fontSize
                    });

                    currentX += charWidth + fontSize * 0.1;
                }

                return paths;
            }.bind(this),

            getCharContour: function(char, x, y, fontSize) {
                const charWidth = fontSize * 0.6;
                const charHeight = fontSize;

                // Простые векторные контуры для букв
                const charMap = {
                    'A': this.createAContour(x, y, charWidth, charHeight),
                    'B': this.createBContour(x, y, charWidth, charHeight),
                    'C': this.createCContour(x, y, charWidth, charHeight),
                    'D': this.createDContour(x, y, charWidth, charHeight),
                    'E': this.createEContour(x, y, charWidth, charHeight),
                    'F': this.createFContour(x, y, charWidth, charHeight),
                    'G': this.createGContour(x, y, charWidth, charHeight),
                    'H': this.createHContour(x, y, charWidth, charHeight),
                    'I': this.createIContour(x, y, charWidth, charHeight),
                    'J': this.createJContour(x, y, charWidth, charHeight),
                    'K': this.createKContour(x, y, charWidth, charHeight),
                    'L': this.createLContour(x, y, charWidth, charHeight),
                    'M': this.createMContour(x, y, charWidth, charHeight),
                    'N': this.createNContour(x, y, charWidth, charHeight),
                    'O': this.createOContour(x, y, charWidth, charHeight),
                    'P': this.createPContour(x, y, charWidth, charHeight),
                    'Q': this.createQContour(x, y, charWidth, charHeight),
                    'R': this.createRContour(x, y, charWidth, charHeight),
                    'S': this.createSContour(x, y, charWidth, charHeight),
                    'T': this.createTContour(x, y, charWidth, charHeight),
                    'U': this.createUContour(x, y, charWidth, charHeight),
                    'V': this.createVContour(x, y, charWidth, charHeight),
                    'W': this.createWContour(x, y, charWidth, charHeight),
                    'X': this.createXContour(x, y, charWidth, charHeight),
                    'Y': this.createYContour(x, y, charWidth, charHeight),
                    'Z': this.createZContour(x, y, charWidth, charHeight),
                    '0': this.createNumber0Contour(x, y, charWidth, charHeight),
                    '1': this.createNumber1Contour(x, y, charWidth, charHeight),
                    '2': this.createNumber2Contour(x, y, charWidth, charHeight),
                    '3': this.createNumber3Contour(x, y, charWidth, charHeight),
                    '4': this.createNumber4Contour(x, y, charWidth, charHeight),
                    '5': this.createNumber5Contour(x, y, charWidth, charHeight),
                    '6': this.createNumber6Contour(x, y, charWidth, charHeight),
                    '7': this.createNumber7Contour(x, y, charWidth, charHeight),
                    '8': this.createNumber8Contour(x, y, charWidth, charHeight),
                    '9': this.createNumber9Contour(x, y, charWidth, charHeight)
                };

                return charMap[char.toUpperCase()] || this.createDefaultContour(x, y, charWidth, charHeight);
            }
        };

        this.font = this.fonts['Basic'];
    }

    // Методы для создания контуров букв (упрощенные векторные формы)
    createAContour(x, y, width, height) {
        return [
            [
                new THREE.Vector3(x, y, 0),
                new THREE.Vector3(x + width/2, y + height, 0),
                new THREE.Vector3(x + width, y, 0),
                new THREE.Vector3(x + width * 0.8, y, 0),
                new THREE.Vector3(x + width/2, y + height * 0.7, 0),
                new THREE.Vector3(x + width * 0.2, y, 0)
            ],
            [
                new THREE.Vector3(x + width * 0.3, y + height * 0.4, 0),
                new THREE.Vector3(x + width * 0.7, y + height * 0.4, 0),
                new THREE.Vector3(x + width * 0.7, y + height * 0.55, 0),
                new THREE.Vector3(x + width * 0.3, y + height * 0.55, 0)
            ]
        ];
    }

    createBContour(x, y, width, height) {
        return [
            [
                new THREE.Vector3(x, y, 0),
                new THREE.Vector3(x, y + height, 0),
                new THREE.Vector3(x + width * 0.7, y + height, 0),
                new THREE.Vector3(x + width, y + height * 0.8, 0),
                new THREE.Vector3(x + width, y + height * 0.6, 0),
                new THREE.Vector3(x + width * 0.7, y + height * 0.5, 0),
                new THREE.Vector3(x + width, y + height * 0.4, 0),
                new THREE.Vector3(x + width, y + height * 0.2, 0),
                new THREE.Vector3(x + width * 0.7, y, 0),
                new THREE.Vector3(x, y, 0)
            ]
        ];
    }

    createDefaultContour(x, y, width, height) {
        return [
            [
                new THREE.Vector3(x, y, 0),
                new THREE.Vector3(x + width, y, 0),
                new THREE.Vector3(x + width, y + height, 0),
                new THREE.Vector3(x, y + height, 0)
            ]
        ];
    }

    // Добавьте аналогичные методы для других букв и цифр...

    getFont() {
        return this.font;
    }

    generateTextContours(text, position, fontSize, plane) {
        if (!this.font || !text || !plane) return [];

        const paths = this.font.getPath(text, 0, 0, fontSize);
        const contours = [];

        if (Array.isArray(paths)) {
            paths.forEach(path => {
                if (path.contours && path.contours.length > 0) {
                    path.contours.forEach(contourPoints => {
                        const worldPoints = contourPoints.map(p => {
                            const localPoint = new THREE.Vector3(
                                p.x + position.x,
                                p.y + position.y,
                                0
                            );
                            return plane.localToWorld(localPoint);
                        });

                        // Замыкаем контур
                        if (worldPoints.length > 0) {
                            worldPoints.push(worldPoints[0].clone());
                        }

                        contours.push(worldPoints);
                    });
                }
            });
        }

        return contours;
    }
}