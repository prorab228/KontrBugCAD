 // project-manager.js
class ProjectManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
    }

    createSTLButton() {
        const toolbar = document.querySelector('.toolbar-container');
        if (toolbar) {
            const stlBtn = document.createElement('button');
            stlBtn.className = 'tool-btn';
            stlBtn.id = 'openSTL';
            stlBtn.title = 'Открыть STL';
            stlBtn.innerHTML = '<i class="fas fa-file-import"></i> STL';
            stlBtn.addEventListener('click', () => this.openSTL());

            const openBtn = document.getElementById('openProject');
            if (openBtn) {
                openBtn.parentNode.insertBefore(stlBtn, openBtn.nextSibling);
            }
        }
    }

    openSTL() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.stl';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                this.loadSTLFromBuffer(event.target.result, file.name);
            };
            reader.readAsArrayBuffer(file);
        };

        input.click();
    }

    loadSTLFromBuffer(buffer, filename) {
        try {
            const isBinary = this.isBinarySTL(buffer);
            const geometry = isBinary ? this.parseBinarySTL(buffer) : this.parseASCIISTL(buffer);

            if (!geometry) {
                this.editor.showStatus('Ошибка при чтении STL файла', 'error');
                return;
            }

            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color('#AAAAAA'),
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const center = new THREE.Vector3();
            box.getCenter(center);
            mesh.position.sub(center);

            mesh.userData = {
                id: 'stl_' + Date.now(),
                name: filename.replace('.stl', ''),
                type: 'stl',
                createdAt: new Date().toISOString(),
                unit: 'mm',
                filename: filename
            };

            this.editor.objectsGroup.add(mesh);
            this.editor.objects.push(mesh);

            this.editor.clearSelection();
            this.editor.selectObject(mesh);

           // this.editor.updateSceneStats();
            this.editor.showStatus(`Загружен STL: ${filename}`, 'success');

            this.editor.history.addAction({
                type: 'import',
                format: 'stl',
                object: mesh.uuid,
                data: { filename: filename }
            });

        } catch (error) {
            console.error('STL loading error:', error);
            this.editor.showStatus(`Ошибка загрузки STL: ${error.message}`, 'error');
        }
    }

    isBinarySTL(buffer) {
        const dataView = new DataView(buffer);
        const triangleCount = dataView.getUint32(80, true);
        const expectedSize = 84 + (triangleCount * 50);
        return buffer.byteLength === expectedSize;
    }

    parseBinarySTL(buffer) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const normals = [];

        const dataView = new DataView(buffer);
        const triangleCount = dataView.getUint32(80, true);
        let offset = 84;

        for (let i = 0; i < triangleCount; i++) {
            const normal = [
                dataView.getFloat32(offset, true),
                dataView.getFloat32(offset + 4, true),
                dataView.getFloat32(offset + 8, true)
            ];
            offset += 12;

            for (let j = 0; j < 3; j++) {
                vertices.push(
                    dataView.getFloat32(offset, true),
                    dataView.getFloat32(offset + 4, true),
                    dataView.getFloat32(offset + 8, true)
                );
                normals.push(...normal);
                offset += 12;
            }

            offset += 2;
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.computeBoundingBox();

        return geometry;
    }

    parseASCIISTL(buffer) {
        const text = new TextDecoder().decode(buffer);
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const normals = [];

        const lines = text.split('\n');
        let currentNormal = null;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('facet normal')) {
                const parts = trimmed.split(/\s+/);
                currentNormal = [
                    parseFloat(parts[2]),
                    parseFloat(parts[3]),
                    parseFloat(parts[4])
                ];
            } else if (trimmed.startsWith('vertex')) {
                const parts = trimmed.split(/\s+/);
                vertices.push(
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                );
                if (currentNormal) {
                    normals.push(...currentNormal);
                }
            }
        }

        if (vertices.length === 0) return null;

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        if (normals.length === vertices.length) {
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        } else {
            geometry.computeVertexNormals();
        }

        geometry.computeBoundingBox();

        return geometry;
    }

    newProject() {
        if (this.editor.objects.length > 0 && !confirm('Создать новый проект? Несохраненные изменения будут потеряны.')) {
            return;
        }

        this.editor.objects.forEach(obj => {
            this.editor.objectsGroup.remove(obj);
            obj.geometry.dispose();
            obj.material.dispose();
        });

        this.editor.objects = [];
        this.editor.workPlanes = [];
        this.editor.sketchPlanes = [];
        this.editor.selectedObjects = [];
        this.editor.history.clear();

        if (this.editor.transformControls) {
            this.editor.transformControls.detach();
        }

        document.getElementById('projectName').textContent = 'Без названия';
        this.editor.updateSceneStats();
        this.editor.updateSceneList();
        this.editor.updateStatus();

        this.editor.showStatus('Создан новый проект', 'info');
    }

    showSaveModal() {
        document.getElementById('saveModal').classList.add('active');
        this.loadSavedProjects();
    }

    saveProject() {
        const name = document.getElementById('projectNameInput').value || 'Без названия';
        const description = document.getElementById('projectDescription').value;

        const project = {
            name: name,
            description: description,
            date: new Date().toISOString(),
            scene: this.serializeScene(),
            version: '1.0'
        };

        this.editor.storage.saveProject(name, project);
        document.getElementById('projectName').textContent = name;
        this.editor.showStatus('Проект сохранен', 'success');
    }

    openProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.cad';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const project = JSON.parse(event.target.result);
                    this.loadProject(project);
                } catch (error) {
                    alert('Ошибка при загрузке проекта: ' + error.message);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    loadProject(project) {
        if (!project.scene || !project.scene.objects) {
            alert('Неверный формат проекта');
            return;
        }

        this.newProject();

        project.scene.objects.forEach(objData => {
            try {
                const obj = this.deserializeObject(objData);
                if (obj) {
                    this.editor.objectsGroup.add(obj);
                    this.editor.objects.push(obj);

                    if (obj.userData.type === 'sketch_plane') {
                        this.editor.sketchPlanes.push(obj);
                    } else if (obj.userData.type === 'work_plane') {
                        this.editor.workPlanes.push(obj);
                    }
                }
            } catch (error) {
                console.error('Ошибка при загрузке объекта:', error);
            }
        });

        document.getElementById('projectName').textContent = project.name;
        this.editor.updateSceneStats();
        this.editor.updateSceneList();

        this.editor.showStatus('Проект загружен: ' + project.name, 'success');
    }

    serializeScene() {
        return {
            metadata: {
                version: '1.0',
                type: 'cad-scene',
                generator: 'КонтрБагCAD'
            },
            objects: this.editor.objects.map(obj => ({
                uuid: obj.uuid,
                type: obj.type,
                userData: obj.userData,
                position: obj.position.toArray(),
                rotation: obj.rotation.toArray(),
                scale: obj.scale.toArray()
            }))
        };
    }

    deserializeObject(data) {
        let geometry;
        let scaleFactor = 1;

        // Восстанавливаем оригинальные размеры
        switch (data.userData.type) {
            case 'cube':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                if (data.userData.originalSize) {
                    // Используем оригинальный размер для масштабирования
                    scaleFactor = data.userData.originalSize.x || 25;
                }
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(0.5, 32, 32);
                if (data.userData.originalSize) {
                    scaleFactor = (data.userData.originalSize.x || 25) / 2;
                }
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                if (data.userData.originalSize) {
                    scaleFactor = data.userData.originalSize.x || 25;
                }
                break;
            case 'cone':
                geometry = new THREE.ConeGeometry(0.5, 1, 32);
                if (data.userData.originalSize) {
                    scaleFactor = data.userData.originalSize.x || 25;
                }
                break;
            case 'torus':
                geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100);
                if (data.userData.originalSize) {
                    scaleFactor = data.userData.originalSize.x || 25;
                }
                break;
            case 'sketch_plane':
            case 'work_plane':
                geometry = new THREE.PlaneGeometry(100, 100);
                break;
            default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        // Материал
        let material;
        if (data.userData.type === 'sketch_plane') {
            material = new THREE.MeshBasicMaterial({
                color: data.userData?.color || 0x00c853,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
        } else if (data.userData.type === 'work_plane') {
            material = new THREE.MeshBasicMaterial({
                color: data.userData?.color || 0x2196F3,
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide
            });
        } else {
            material = new THREE.MeshPhongMaterial({
                color: data.userData?.color || 0xAAAAAA,
                transparent: true,
                opacity: 0.9
            });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = data.userData;

        // Восстанавливаем позицию и вращение
        if (data.position) mesh.position.fromArray(data.position);
        if (data.rotation) mesh.rotation.fromArray(data.rotation);

        // Восстанавливаем масштаб с учетом оригинальных размеров
        if (data.scale && data.userData.type !== 'sketch_plane' && data.userData.type !== 'work_plane') {
            const scaleArray = data.scale;
            mesh.scale.set(
                scaleArray[0] * scaleFactor,
                scaleArray[1] * scaleFactor,
                scaleArray[2] * scaleFactor
            );
        } else if (scaleFactor !== 1) {
            // Применяем масштаб для восстановления оригинального размера
            mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }

        if (data.userData.type !== 'sketch_plane' && data.userData.type !== 'work_plane') {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }

        return mesh;
    }

    loadSavedProjects() {
        const projects = this.editor.storage.getProjects();
        const container = document.getElementById('savedProjects');
        if (!container) return;

        container.innerHTML = '';

        if (projects.length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center;">Нет сохраненных проектов</p>';
            return;
        }

        projects.forEach(project => {
            const div = document.createElement('div');
            div.className = 'project-item';

            const date = new Date(project.date).toLocaleDateString();
            div.innerHTML = `
                <div>
                    <strong>${project.name}</strong><br>
                    <small>${date}</small>
                </div>
                <button class="load-project-btn" data-name="${project.name}">
                    <i class="fas fa-folder-open"></i>
                </button>
            `;

            container.appendChild(div);

            div.querySelector('.load-project-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadProject(project);
                document.getElementById('saveModal').classList.remove('active');
            });
        });
    }

    showExportModal() {
        document.getElementById('exportModal').classList.add('active');
        document.getElementById('exportFileName').value =
            document.getElementById('projectName').textContent.replace(/\s+/g, '_');
    }

    exportModel() {
        const format = document.getElementById('exportFormat').value;
        const exportSelected = document.getElementById('exportSelected').checked;
        const fileName = document.getElementById('exportFileName').value || 'model';

        let exportObjects;
        if (exportSelected && this.editor.selectedObjects.length > 0) {
            exportObjects = this.editor.selectedObjects;
        } else {
            exportObjects = this.editor.objects;
        }

        if (exportObjects.length === 0) {
            alert('Нет объектов для экспорта!');
            return;
        }

        switch (format) {
            case 'stl':
            case 'stl-ascii':
                this.exportSTL(exportObjects, fileName, format === 'stl-ascii');
                break;
            case 'json':
                this.exportJSON(exportObjects, fileName);
                break;
        }
    }

    exportSTL(objects, fileName, ascii = false) {
        const exporter = new THREE.STLExporter();

        let sceneToExport;
        if (objects.length === 1) {
            sceneToExport = objects[0];
        } else {
            sceneToExport = new THREE.Group();
            objects.forEach(obj => sceneToExport.add(obj.clone()));
        }

        const stlString = exporter.parse(sceneToExport, { binary: !ascii });
        const blob = new Blob(
            [stlString],
            { type: ascii ? 'text/plain' : 'application/octet-stream' }
        );

        this.downloadFile(blob, fileName + '.stl');
    }

    exportJSON() {
        const fileName = document.getElementById('projectName').textContent.replace(/\s+/g, '_');
        const data = this.serializeScene();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });

        this.downloadFile(blob, fileName + '.json');
    }

    // Методы для преобразования координат между системами
    rotateGeometryForExport(geometry) {
        // Поворачиваем геометрию так, чтобы Z смотрел вверх
        const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        geometry.applyMatrix4(rotation);
        return geometry;
    }

    rotateGeometryForImport(geometry) {
        // Поворачиваем геометрию обратно (из Z-up в Y-up)
        const rotation = new THREE.Matrix4().makeRotationX(Math.PI / 2);
        geometry.applyMatrix4(rotation);
        return geometry;
    }

    exportSVG() {
        this.editor.showStatus('Экспорт SVG пока не реализован для нового скетча', 'warning');
    }

    downloadFile(blob, fileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.editor.showStatus('Экспорт завершен: ' + fileName, 'success');
    }
}