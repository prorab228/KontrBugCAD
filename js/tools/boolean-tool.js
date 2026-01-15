// boolean-tool.js
class BooleanTool extends Tool {
    constructor(editor, operation) {
        // Вызываем super ПЕРЕД использованием this
        super(`boolean-${operation}`, BooleanTool.getIcon(operation), editor);
        this.operation = operation;
        this.requiresSelection = true;
        this.minObjects = 2;
    }

    // Статический метод для получения иконки
    static getIcon(operation) {
        const icons = {
            'union': 'fa-plus-circle',
            'subtract': 'fa-minus-circle',
            'intersect': 'fa-times-circle'
        };
        return icons[operation] || 'fa-object-group';
    }

    getOperationName() {
        const names = {
            'union': 'объединения',
            'subtract': 'вычитания',
            'intersect': 'пересечения'
        };
        return names[this.operation] || this.operation;
    }

    onActivate() {
        if (!this.canActivate()) {
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        if (this.editor.selectedObjects.length < this.minObjects) {
            this.editor.showStatus(`Для ${this.getOperationName()} необходимо выбрать минимум ${this.minObjects} объекта`, 'error');
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        // Выполняем булеву операцию
        this.performBooleanOperation();

        // Возвращаемся к инструменту выделения
        setTimeout(() => {
            this.editor.toolManager.restorePreviousTool();
        }, 100);
    }

    performBooleanOperation() {
        if (!this.editor.booleanOps) {
            this.editor.showStatus('Булевы операции не инициализированы', 'error');
            return;
        }

        const check = this.editor.booleanOps.canPerformOperation(
            this.operation === 'subtract' || this.operation === 'intersect'
                ? this.editor.selectedObjects.slice(0, 2)
                : this.editor.selectedObjects
        );

        if (!check.can) {
            this.editor.showStatus(check.reason, 'error');
            return;
        }

        if (check.warning && !confirm(`${check.reason}\nПродолжить операцию?`)) {
            return;
        }

        this.editor.showLoadingIndicator(`Выполняется ${this.getOperationName()}...`);

        setTimeout(() => {
            try {
                let result;
                switch(this.operation) {
                    case 'union':
                        result = this.editor.performUnion();
                        break;
                    case 'subtract':
                        result = this.editor.performSubtract();
                        break;
                    case 'intersect':
                        result = this.editor.performIntersect();
                        break;
                }

                this.editor.hideLoadingIndicator();

                if (result) {
                    this.editor.addBooleanResult(result, this.operation);
                } else {
                    this.editor.showStatus('Операция не дала результата', 'error');
                }
            } catch (error) {
                this.editor.hideLoadingIndicator();
                console.error(`${this.operation} error:`, error);
                this.editor.showStatus(`Ошибка ${this.getOperationName()}: ${error.message}`, 'error');
            }
        }, 50);
    }
}

// Дополнительные классы для каждой операции
class BooleanUnionTool extends BooleanTool {
    constructor(editor) {
        super(editor, 'union');
    }
}

class BooleanSubtractTool extends BooleanTool {
    constructor(editor) {
        super(editor, 'subtract');
    }
}

class BooleanIntersectTool extends BooleanTool {
    constructor(editor) {
        super(editor, 'intersect');
    }
}