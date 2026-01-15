 // gear-tool.js
class GearTool extends Tool {
    constructor(editor) {
        super('gearGenerator', 'fa-cog', editor);
        this.generator = editor.gearGenerator;
    }

    onActivate() {
        // Показываем UI генератора
        this.generator.showGearUI();

        // Возвращаемся к предыдущему инструменту после показа UI
        setTimeout(() => {
            this.editor.toolManager.restorePreviousTool();
        }, 50);
    }
}

// thread-tool.js
class ThreadTool extends Tool {
    constructor(editor) {
        super('threadGenerator', 'fa-screwdriver', editor);
        this.generator = editor.threadGenerator;
    }

    onActivate() {
        // Показываем UI генератора резьбы
        this.generator.showThreadUI();

        // Возвращаемся к предыдущему инструменту
        setTimeout(() => {
            this.editor.toolManager.restorePreviousTool();
        }, 50);
    }
}