/**
 * Вспомогательные функции для работы со скетчами
 */
class SketchUtils {
    // Расчет точек прямоугольника
    static calculateRectanglePoints(plane, start, end) {
        if (!plane) return [];

        const localStart = plane.worldToLocal(start.clone());
        const localEnd = plane.worldToLocal(end.clone());

        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const points = [
            new THREE.Vector3(minX, minY, 0),
            new THREE.Vector3(maxX, minY, 0),
            new THREE.Vector3(maxX, maxY, 0),
            new THREE.Vector3(minX, maxY, 0),
            new THREE.Vector3(minX, minY, 0)
        ];

        return points.map(p => plane.localToWorld(p));
    }

    // Расчет точек окружности
    static calculateCirclePoints(plane, center, radius, segments = 32) {
        if (!plane) return [];

        const localCenter = plane.worldToLocal(center.clone());
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = localCenter.x + Math.cos(theta) * radius;
            const y = localCenter.y + Math.sin(theta) * radius;
            points.push(plane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        return points;
    }

    // Расчет точек многоугольника
    static calculatePolygonPoints(plane, center, radius, sides) {
        if (!plane) return [];

        const localCenter = plane.worldToLocal(center.clone());
        const points = [];

        for (let i = 0; i <= sides; i++) {
            const theta = (i / sides) * Math.PI * 2;
            const x = localCenter.x + Math.cos(theta) * radius;
            const y = localCenter.y + Math.sin(theta) * radius;
            points.push(plane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        return points;
    }

    // Проверка, замкнут ли контур
    static isContourClosed(points, threshold = 0.1) {
        if (points.length < 3) return false;

        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];

        const distance = firstPoint.distanceTo(lastPoint);
        return distance < threshold;
    }

    // Алгоритм нахождения пересечения двух отрезков
    static lineIntersection(p1, p2, p3, p4) {
        const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);

        if (denominator === 0) return null;

        const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
        const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return new THREE.Vector3(
                p1.x + ua * (p2.x - p1.x),
                p1.y + ua * (p2.y - p1.y),
                0
            );
        }

        return null;
    }

    // Создание текстовых контуров
    static createTextContours(text, fontSize, position, plane) {
        if (!plane) return [];

        const localPos = plane.worldToLocal(position.clone());
        const contours = [];
        const charWidth = fontSize * 0.6;
        const charHeight = fontSize;
        const spacing = fontSize * 0.1;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const x = localPos.x + i * (charWidth + spacing);
            const y = localPos.y;

            const points = [
                new THREE.Vector3(x, y, 0),
                new THREE.Vector3(x + charWidth, y, 0),
                new THREE.Vector3(x + charWidth, y + charHeight, 0),
                new THREE.Vector3(x, y + charHeight, 0),
                new THREE.Vector3(x, y, 0)
            ];

            contours.push(points.map(p => plane.localToWorld(p)));
        }

        return contours;
    }
}