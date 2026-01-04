// geometry-polyfill.js
// Полифил для THREE.Geometry для совместимости с ThreeBSP

if (typeof THREE !== 'undefined') {
    console.log('Creating THREE.Geometry polyfill for ThreeBSP compatibility');

    // Face3
    THREE.Face3 = function(a, b, c, normal, color, materialIndex) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.normal = normal instanceof THREE.Vector3 ? normal : new THREE.Vector3();
        this.vertexNormals = Array.isArray(normal) ? normal : [];
        this.color = color instanceof THREE.Color ? color : new THREE.Color();
        this.vertexColors = [];
        this.materialIndex = materialIndex !== undefined ? materialIndex : 0;
    };

    // Face4 (для четырехугольников)
    THREE.Face4 = function(a, b, c, d, normal, color, materialIndex) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.normal = normal instanceof THREE.Vector3 ? normal : new THREE.Vector3();
        this.vertexNormals = Array.isArray(normal) ? normal : [];
        this.color = color instanceof THREE.Color ? color : new THREE.Color();
        this.vertexColors = [];
        this.materialIndex = materialIndex !== undefined ? materialIndex : 0;
    };

    // Geometry
    THREE.Geometry = function() {
        this.uuid = THREE.MathUtils.generateUUID();
        this.name = '';
        this.type = 'Geometry';

        this.vertices = [];
        this.colors = [];
        this.faces = [];
        this.faceVertexUvs = [[]];

        this.morphTargets = [];
        this.morphNormals = [];
        this.skinWeights = [];
        this.skinIndices = [];

        this.lineDistances = [];

        this.boundingBox = null;
        this.boundingSphere = null;

        this.elementsNeedUpdate = false;
        this.verticesNeedUpdate = false;
        this.uvsNeedUpdate = false;
        this.normalsNeedUpdate = false;
        this.colorsNeedUpdate = false;
        this.lineDistancesNeedUpdate = false;
        this.groupsNeedUpdate = false;
    };

    THREE.Geometry.prototype = {
        constructor: THREE.Geometry,

        computeFaceNormals: function() {
            for (let i = 0; i < this.faces.length; i++) {
                const face = this.faces[i];

                if (face instanceof THREE.Face3) {
                    const vA = this.vertices[face.a];
                    const vB = this.vertices[face.b];
                    const vC = this.vertices[face.c];

                    const cb = new THREE.Vector3().subVectors(vC, vB);
                    const ab = new THREE.Vector3().subVectors(vA, vB);
                    cb.cross(ab);

                    cb.normalize();

                    face.normal.copy(cb);
                } else if (face instanceof THREE.Face4) {
                    // Для четырехугольника разбиваем на два треугольника
                    const vA = this.vertices[face.a];
                    const vB = this.vertices[face.b];
                    const vC = this.vertices[face.c];
                    const vD = this.vertices[face.d];

                    // Вычисляем нормаль для первого треугольника
                    const cb1 = new THREE.Vector3().subVectors(vC, vB);
                    const ab1 = new THREE.Vector3().subVectors(vA, vB);
                    cb1.cross(ab1);
                    cb1.normalize();

                    // Вычисляем нормаль для второго треугольника
                    const cb2 = new THREE.Vector3().subVectors(vD, vC);
                    const ab2 = new THREE.Vector3().subVectors(vA, vC);
                    cb2.cross(ab2);
                    cb2.normalize();

                    // Усредняем нормали
                    const normal = new THREE.Vector3()
                        .add(cb1)
                        .add(cb2)
                        .divideScalar(2)
                        .normalize();

                    face.normal.copy(normal);
                }
            }
        },

        computeVertexNormals: function() {
            // Сбрасываем существующие нормали вершин
            for (let i = 0; i < this.faces.length; i++) {
                const face = this.faces[i];
                if (!face.vertexNormals) {
                    face.vertexNormals = [];
                } else {
                    face.vertexNormals.length = 0;
                }
            }

            // Создаем массив для накопления нормалей вершин
            const vertexNormals = new Array(this.vertices.length);
            for (let i = 0; i < this.vertices.length; i++) {
                vertexNormals[i] = new THREE.Vector3();
            }

            // Суммируем нормали граней для каждой вершины
            for (let i = 0; i < this.faces.length; i++) {
                const face = this.faces[i];

                if (face instanceof THREE.Face3) {
                    vertexNormals[face.a].add(face.normal);
                    vertexNormals[face.b].add(face.normal);
                    vertexNormals[face.c].add(face.normal);
                } else if (face instanceof THREE.Face4) {
                    vertexNormals[face.a].add(face.normal);
                    vertexNormals[face.b].add(face.normal);
                    vertexNormals[face.c].add(face.normal);
                    vertexNormals[face.d].add(face.normal);
                }
            }

            // Нормализуем и присваиваем
            for (let i = 0; i < this.faces.length; i++) {
                const face = this.faces[i];

                if (face instanceof THREE.Face3) {
                    face.vertexNormals[0] = vertexNormals[face.a].clone().normalize();
                    face.vertexNormals[1] = vertexNormals[face.b].clone().normalize();
                    face.vertexNormals[2] = vertexNormals[face.c].clone().normalize();
                } else if (face instanceof THREE.Face4) {
                    face.vertexNormals[0] = vertexNormals[face.a].clone().normalize();
                    face.vertexNormals[1] = vertexNormals[face.b].clone().normalize();
                    face.vertexNormals[2] = vertexNormals[face.c].clone().normalize();
                    face.vertexNormals[3] = vertexNormals[face.d].clone().normalize();
                }
            }
        },

        computeBoundingBox: function() {
            if (this.vertices.length === 0) {
                this.boundingBox = new THREE.Box3(
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 0)
                );
                return;
            }

            const firstVertex = this.vertices[0];
            let minX = firstVertex.x;
            let minY = firstVertex.y;
            let minZ = firstVertex.z;
            let maxX = minX;
            let maxY = minY;
            let maxZ = minZ;

            for (let i = 1; i < this.vertices.length; i++) {
                const vertex = this.vertices[i];

                minX = Math.min(minX, vertex.x);
                minY = Math.min(minY, vertex.y);
                minZ = Math.min(minZ, vertex.z);

                maxX = Math.max(maxX, vertex.x);
                maxY = Math.max(maxY, vertex.y);
                maxZ = Math.max(maxZ, vertex.z);
            }

            this.boundingBox = new THREE.Box3(
                new THREE.Vector3(minX, minY, minZ),
                new THREE.Vector3(maxX, maxY, maxZ)
            );
        },

        computeBoundingSphere: function() {
            this.computeBoundingBox();

            if (!this.boundingBox) return;

            const center = new THREE.Vector3();
            this.boundingBox.getCenter(center);

            let maxRadiusSq = 0;
            for (let i = 0; i < this.vertices.length; i++) {
                const distanceSq = center.distanceToSquared(this.vertices[i]);
                if (distanceSq > maxRadiusSq) {
                    maxRadiusSq = distanceSq;
                }
            }

            this.boundingSphere = new THREE.Sphere(center, Math.sqrt(maxRadiusSq));
        },

        merge: function(geometry, matrix, materialIndexOffset) {
            // Простая реализация merge
            if (!geometry) return this;

            const vertices = geometry.vertices;
            const faces = geometry.faces;

            const startIndex = this.vertices.length;

            // Добавляем вершины
            for (let i = 0; i < vertices.length; i++) {
                let vertex = vertices[i].clone();
                if (matrix) {
                    vertex.applyMatrix4(matrix);
                }
                this.vertices.push(vertex);
            }

            // Добавляем грани
            for (let i = 0; i < faces.length; i++) {
                const face = faces[i];
                if (face instanceof THREE.Face3) {
                    const newFace = new THREE.Face3(
                        face.a + startIndex,
                        face.b + startIndex,
                        face.c + startIndex,
                        face.normal.clone(),
                        face.color.clone(),
                        face.materialIndex + (materialIndexOffset || 0)
                    );
                    newFace.vertexNormals = face.vertexNormals ? face.vertexNormals.map(n => n.clone()) : [];
                    this.faces.push(newFace);
                }
            }

            return this;
        }
    };

    console.log('THREE.Geometry polyfill created successfully');
}