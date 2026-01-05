// tool-manager.js
class ToolManager {
    constructor(editor) {
        this.editor = editor;
        this.tools = new Map();
        this.currentTool = null;
        this.previousTool = null;
    }

    registerTool(name, toolInstance) {
        this.tools.set(name, toolInstance);

        // Находим кнопку в UI и связываем ее с инструментом
        const button = document.querySelector(`[data-tool="${name}"]`);
        if (button) {
            toolInstance.uiButton = button;
            button.addEventListener('click', () => this.setCurrentTool(name));
        }

        return toolInstance;
    }

    setCurrentTool(toolName) {
        // Если пытаемся активировать уже активный инструмент
        if (this.currentTool && this.currentTool.name === toolName) {
            return;
        }

        // Деактивируем текущий инструмент
        if (this.currentTool) {
            this.currentTool.deactivate();
            this.previousTool = this.currentTool;
        }

        // Активируем новый инструмент
        const tool = this.tools.get(toolName);
        if (tool) {
            this.currentTool = tool;

            // Проверяем, можно ли активировать инструмент
            if (tool.requiresSelection && this.editor.selectedObjects.length === 0) {
                this.editor.showStatus(`Для ${tool.name} необходимо выбрать объект`, 'error');

                // Если есть предыдущий инструмент, возвращаемся к нему
                if (this.previousTool) {
                    this.setCurrentTool(this.previousTool.name);
                } else {
                    this.setCurrentTool('select');
                }
                return;
            }

            this.currentTool.activate();

            // Обновляем глобальное состояние редактора
            this.editor.currentTool = toolName;

            // Обновляем UI
            this.updateToolUI(toolName);
        }
    }

    getTool(toolName) {
        return this.tools.get(toolName);
    }

    getCurrentTool() {
        return this.currentTool;
    }

    updateToolUI(toolName) {
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.classList.remove('active', 'pending');
        });

        const activeBtn = document.querySelector(`[data-tool="${toolName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    restorePreviousTool() {
        if (this.previousTool) {
            this.setCurrentTool(this.previousTool.name);
        } else {
            this.setCurrentTool('select');
        }
    }

    // Делегирование событий активному инструменту
    handleMouseDown(e) {
        if (this.currentTool && this.currentTool.isActive) {
            return this.currentTool.onMouseDown(e);
        }
        return false;
    }

    handleMouseMove(e) {
        if (this.currentTool && this.currentTool.isActive) {
            this.currentTool.onMouseMove(e);
        }
    }

    handleMouseUp(e) {
        if (this.currentTool && this.currentTool.isActive) {
            this.currentTool.onMouseUp(e);
        }
    }

    handleKeyDown(e) {
        if (this.currentTool && this.currentTool.isActive) {
            if (this.currentTool.onKeyDown(e)) {
                return true;
            }
        }

        // Глобальные горячие клавиши для инструментов
        const key = e.key.toLowerCase();
        switch (key) {
            case 'escape':
                if (this.currentTool && this.currentTool.name !== 'select') {
                    this.setCurrentTool('select');
                    e.preventDefault();
                    return true;
                }
                break;
            case 'm': // Линейка
            case 'ь': // Русская раскладка
                if (e.ctrlKey || e.metaKey) {
                    this.setCurrentTool('rulerTool');
                    e.preventDefault();
                    return true;
                }
                break;
//            case 'g': // Шестерня
//            case 'п': // Русская раскладка
//                if (e.ctrlKey || e.metaKey) {
//                    this.setCurrentTool('gearGenerator');
//                    e.preventDefault();
//                    return true;
//                }
//                break;
//            case 't': // Резьба
//            case 'е': // Русская раскладка
//                if (e.ctrlKey || e.metaKey) {
//                    this.setCurrentTool('threadGenerator');
//                    e.preventDefault();
//                    return true;
//                }
//                break;
        }
        return false;
    }

    handleKeyUp(e) {
        if (this.currentTool && this.currentTool.isActive) {
            this.currentTool.onKeyUp(e);
        }
    }

    handleDoubleClick(e) {
        if (this.currentTool && this.currentTool.isActive) {
            return this.currentTool.onDoubleClick(e);
        }
        return false;
    }
}