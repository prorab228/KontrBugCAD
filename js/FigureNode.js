// Класс FigureNode остается без изменений
class FigureNode {
    constructor(contour) {
        this.id = `figure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.contour = contour;
        this.parent = null;
        this.children = [];
        this.depth = 0;
        this.isHole = false;
        this.isOuter = true;
        this.area = contour.area || 0;
        this.boundingBox = contour.boundingBox;
        this.center = contour.center;
        this.elementIds = new Set();
        this.element = contour.element || (contour.elements ? contour.elements[0] : null);

        if (contour.element) {
            this.elementIds.add(contour.element.uuid);
        } else if (contour.elements) {
            contour.elements.forEach(el => this.elementIds.add(el.uuid));
        }

        this.type = contour.type || 'unknown';
        this.isClosed = contour.isClosed || false;
        this.isClockwise = contour.isClockwise || false;
    }

    addChild(childNode) {
        if (!this.children.includes(childNode)) {
            this.children.push(childNode);
            childNode.parent = this;
            childNode.depth = this.depth + 1;
            return true;
        }
        return false;
    }

    removeChild(childNode) {
        const index = this.children.indexOf(childNode);
        if (index > -1) {
            this.children.splice(index, 1);
            childNode.parent = null;
            childNode.depth = 0;
            return true;
        }
        return false;
    }

    getAllDescendants() {
        const descendants = [];
        const traverse = (node) => {
            node.children.forEach(child => {
                descendants.push(child);
                traverse(child);
            });
        };
        traverse(this);
        return descendants;
    }

    getHoleDescendants() {
        return this.getAllDescendants().filter(node => node.isHole);
    }

    getOuterDescendants() {
        return this.getAllDescendants().filter(node => !node.isHole);
    }

    getImmediateHoles() {
        return this.children.filter(child => child.isHole);
    }

    getImmediateOuters() {
        return this.children.filter(child => !child.isHole);
    }

    isAncestorOf(node) {
        let current = node;
        while (current) {
            if (current === this) return true;
            current = current.parent;
        }
        return false;
    }

    isDescendantOf(node) {
        return node.isAncestorOf(this);
    }

    getPathToRoot() {
        const path = [];
        let current = this;
        while (current) {
            path.unshift(current);
            current = current.parent;
        }
        return path;
    }

    getNestingLevel() {
        return this.depth;
    }

    toString() {
        const type = this.isHole ? "HOLE" : "OUTER";
        return `${type}[depth=${this.depth}, area=${this.area.toFixed(2)}, children=${this.children.length}]`;
    }
}