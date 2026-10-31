// MeshSealRepair.js
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

export class MeshSealRepair {
    constructor() {
        this.module = null;
        this.isReady = false;
    }

    /**
     * Асинхронно загружает и инициализирует WASM-модуль meshseal.
     * @param {string} wasmJsPath - Путь к файлу meshseal.js
     */
    async init(wasmJsPath) {
        if (this.isReady) return;

        try {
            // Динамический импорт Emscripten-модуля
            const createMeshseal = (await import(wasmJsPath)).default;

            // Инициализация модуля. locateFile гарантирует, что .wasm файл
            // будет загружен из той же директории, что и .js
            this.module = await createMeshseal({
                locateFile: (path) => path // или полный путь к .wasm, если нужно
            });

            this.isReady = true;
            console.log('[MeshSealRepair] WASM-модуль успешно загружен');
        } catch (error) {
            console.error('[MeshSealRepair] Ошибка загрузки WASM-модуля:', error);
            throw error;
        }
    }

    /**
     * Ремонтирует геометрию, используя meshseal.
     * @param {THREE.BufferGeometry} geometry - Исходная геометрия.
     * @param {Function} [onProgress] - Колбэк для отслеживания прогресса.
     * @returns {Promise<THREE.BufferGeometry>} - Исправленная геометрия.
     */
    async repair(geometry, onProgress) {
        if (!this.isReady) {
            throw new Error('MeshSealRepair не инициализирован. Вызовите init() сначала.');
        }

        // 1. Конвертируем THREE.BufferGeometry в бинарный STL (ArrayBuffer)
        const stlBuffer = this._geometryToBinarySTL(geometry);
        if (!stlBuffer) {
            throw new Error('Не удалось конвертировать геометрию в STL.');
        }

        // 2. Вызываем функцию ремонта из WASM-модуля
        // Функция repairStl принимает Uint8Array (или ArrayBuffer) и колбэк
        const result = this.module.repairStl(new Uint8Array(stlBuffer), (progress) => {
            // Пробрасываем прогресс наружу, если колбэк предоставлен
            if (onProgress) {
                onProgress({
                    stage: progress.stage,
                    elapsedMs: progress.elapsedMs,
                    faceCount: progress.faceCount,
                    vertexCount: progress.vertexCount,
                });
            }
            return true; // Продолжаем выполнение
        });

        // 3. Проверяем результат
        if (!result || !result.ok) {
            const errorMsg = result?.error || 'meshseal: неизвестная ошибка ремонта';
            throw new Error(errorMsg);
        }

        // 4. Конвертируем полученный STL обратно в THREE.BufferGeometry
        const repairedGeometry = this._binarySTLToGeometry(result.bytes);
        if (!repairedGeometry) {
            throw new Error('Не удалось конвертировать результат ремонта в геометрию.');
        }

        // 5. Добавляем метаданные о результате ремонта в userData геометрии
        repairedGeometry.userData.meshseal = {
            watertight: result.watertight,
            components: result.components,
            volumes: result.volumes,
            selfIntersections: result.selfIntersections,
            confidence: result.confidence,
            inputFaces: result.inputFaces,
            outputFaces: result.outputFaces,
            notes: result.notes,
            stages: result.stages,
        };

        return repairedGeometry;
    }

    /**
     * Конвертирует BufferGeometry в бинарный STL (ArrayBuffer).
     * @param {THREE.BufferGeometry} geometry
     * @returns {ArrayBuffer|null}
     * @private
     */
    _geometryToBinarySTL(geometry) {
        try {
            // STLExporter ожидает Mesh
            const mesh = new THREE.Mesh(geometry);
            const exporter = new STLExporter();
            // Экспортируем в ArrayBuffer
            const arrayBuffer = exporter.parse(mesh, { binary: true });
            return arrayBuffer;
        } catch (error) {
            console.error('[MeshSealRepair] Ошибка экспорта в STL:', error);
            return null;
        }
    }

    /**
     * Конвертирует бинарный STL (ArrayBuffer) обратно в BufferGeometry.
     * @param {ArrayBuffer} stlBuffer
     * @returns {THREE.BufferGeometry|null}
     * @private
     */
    _binarySTLToGeometry(stlBuffer) {
        try {
            const loader = new STLLoader();
            const geometry = loader.parse(stlBuffer);
            geometry.computeVertexNormals();
            return geometry;
        } catch (error) {
            console.error('[MeshSealRepair] Ошибка импорта из STL:', error);
            return null;
        }
    }
}