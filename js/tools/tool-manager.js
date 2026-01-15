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
        // Ищем кнопки с data-tool атрибутом
        const button = document.querySelector(`[data-tool="${name}"]`);
        // Также ищем кнопки в dropdown меню
        const dropdownButton = document.querySelector(`[data-tool="${name}"]`);

        if (button) {
            toolInstance.uiButton = button;
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.setCurrentTool(name);
            });
        }

        return toolInstance;
    }

    setCurrentTool(toolName) {
        console.log(`Setting current tool to: ${toolName}`);

        // Если пытаемся активировать уже активный инструмент
        if (this.currentTool && this.currentTool.name === toolName) {
            console.log(`Tool ${toolName} is already active`);
            return;
        }

        // Деактивируем текущий инструмент
        if (this.currentTool) {
            console.log(`Deactivating current tool: ${this.currentTool.name}`);
            this.currentTool.deactivate();
            this.previousTool = this.currentTool;
        }

        // Активируем новый инструмент
        const tool = this.tools.get(toolName);
        if (tool) {
            console.log(`Activating tool: ${toolName}`);
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

            // Обновляем панель свойств
            this.editor.updatePropertiesPanel();

            // Показываем статус
            const toolNames = {
                'select': 'Выделение',
                'move': 'Перемещение',
                'rotate': 'Вращение',
                'scale': 'Масштабирование',
                'sketch': 'Скетч',
                'extrude': 'Вытягивание',
                'sketch': 'Чертеж',
                'workplane': 'Рабочая плоскость',
                'rulerTool': 'Линейка',
                'gearGenerator': 'Генератор шестерен',
                'threadGenerator': 'Генератор резьбы',
                'split': 'Разрезание',
                'mirror': 'Отражение',
                'group': 'Группировка',
                'ungroup': 'Разгруппировка',
                'boolean-union': 'Объединение',
                'boolean-subtract': 'Вычитание',
                'boolean-intersect': 'Пересечение'
            };

           // this.editor.showStatus(`Активирован инструмент: ${toolNames[toolName] || toolName}`, 'info');
        } else {
            console.error(`Tool not found: ${toolName}`);
        }
    }

    getTool(toolName) {
        return this.tools.get(toolName);
    }

    getCurrentTool() {
        return this.currentTool;
    }

    updateToolUI(toolName) {
        // Сначала снимаем активные классы со всех кнопок инструментов
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Активируем кнопки с data-tool
        const toolButtons = document.querySelectorAll(`[data-tool]`);
        toolButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tool === toolName) {
                btn.classList.add('active');
            }
        });

        // Также активируем кнопки в выпадающих меню
        const dropdownLinks = document.querySelectorAll('.dropdown-menu a[data-tool]');
        dropdownLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.tool === toolName) {
                link.classList.add('active');
            }
        });

        // Для инструментов трансформации активируем родительскую кнопку
        if (['move', 'rotate', 'scale'].includes(toolName)) {
            const transformDropdown = document.querySelector('.dropdown-toggle[title="Трансформация"]');
            if (transformDropdown) {
                transformDropdown.classList.add('active');
            }
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
            const handled = this.currentTool.onMouseDown(e);
            console.log(`Tool ${this.currentTool.name} handled mouse down: ${handled}`);
            return handled;
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
            const handled = this.currentTool.onMouseUp(e);
            console.log(`Tool ${this.currentTool.name} handled mouse up: ${handled}`);

        }
    }

    handleKeyDown(e) {
        if (this.currentTool && this.currentTool.isActive) {
            const handled = this.currentTool.onKeyDown(e);
            console.log(`Tool ${this.currentTool.name} handled KeyDown: ${handled}`);
            if (handled) {
                return true;
            }
        }

        // Глобальные горячие клавиши для инструментов
        const key = e.key.toLowerCase();
        switch (key) {
            case 'escape':
                if (this.currentTool && this.currentTool.name !== 'sketch') {
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
            case 's': // Split
            case 'ы': // Русская раскладка
                if (e.ctrlKey && e.shiftKey) { // Ctrl+Shift+S для разрезания
                    this.setCurrentTool('split');
                    e.preventDefault();
                    return true;
                }
                break;

            case 'm': // Mirror
            case 'ь': // Русская раскладка
                if (e.ctrlKey && e.shiftKey) { // Ctrl+Shift+M для отражения
                    this.setCurrentTool('mirror');
                    e.preventDefault();
                    return true;
                }
                break;
            case 'g': // Group
            case 'п': // Русская раскладка
                if (e.ctrlKey && !e.shiftKey) {
                    this.setCurrentTool('group');
                    e.preventDefault();
                    return true;
                } else if (e.ctrlKey && e.shiftKey) {
                    this.setCurrentTool('ungroup');
                    e.preventDefault();
                    return true;
                }
                break;
            // Горячие клавиши для трансформаций
            case 'w': // Move
            case 'ц': // Русская раскладка
                if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
                    this.setCurrentTool('move');
                    e.preventDefault();
                    return true;
                }
                break;
            case 'e': // Rotate
            case 'у': // Русская раскладка
                if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
                    this.setCurrentTool('rotate');
                    e.preventDefault();
                    return true;
                }
                break;
            case 'r': // Scale
            case 'к': // Русская раскладка
                if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
                    this.setCurrentTool('scale');
                    e.preventDefault();
                    return true;
                }
                break;

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