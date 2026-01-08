class StorageManager {
    constructor() {
        this.storageKey = 'cad_projects';
        this.currentProjectKey = 'cad_current_project';
    }

    saveProject(name, project) {
        const projects = this.getProjects();

        // Проверяем, существует ли проект с таким именем
        const existingIndex = projects.findIndex(p => p.name === name);
        if (existingIndex > -1) {
            projects[existingIndex] = project;
        } else {
            projects.push(project);
        }

        // Сохраняем все проекты
        localStorage.setItem(this.storageKey, JSON.stringify(projects));

        // Сохраняем как текущий проект
        localStorage.setItem(this.currentProjectKey, JSON.stringify(project));

        return true;
    }

    getProjects() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Ошибка при чтении проектов:', error);
            return [];
        }
    }

    getProject(name) {
        const projects = this.getProjects();
        return projects.find(p => p.name === name);
    }

    deleteProject(name) {
        const projects = this.getProjects();
        const filtered = projects.filter(p => p.name !== name);
        localStorage.setItem(this.storageKey, JSON.stringify(filtered));
        return true;
    }

    getCurrentProject() {
        try {
            const data = localStorage.getItem(this.currentProjectKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Ошибка при чтении текущего проекта:', error);
            return null;
        }
    }

    clearStorage() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.currentProjectKey);
    }

    // Экспорт всех проектов в файл
    exportAllProjects() {
        const projects = this.getProjects();
        const data = {
            metadata: {
                version: '1.0',
                type: 'cad-projects-backup',
                exportDate: new Date().toISOString(),
                count: projects.length
            },
            projects: projects
        };

        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `cad_projects_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    // Импорт проектов из файла
    importProjects(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);

                    if (!data.projects || !Array.isArray(data.projects)) {
                        throw new Error('Неверный формат файла');
                    }

                    const existingProjects = this.getProjects();
                    const existingNames = new Set(existingProjects.map(p => p.name));

                    // Объединяем проекты, заменяя существующие с одинаковыми именами
                    data.projects.forEach(project => {
                        if (existingNames.has(project.name)) {
                            // Заменяем существующий проект
                            const index = existingProjects.findIndex(p => p.name === project.name);
                            existingProjects[index] = project;
                        } else {
                            // Добавляем новый проект
                            existingProjects.push(project);
                        }
                    });

                    // Сохраняем все проекты
                    localStorage.setItem(this.storageKey, JSON.stringify(existingProjects));

                    resolve({
                        success: true,
                        imported: data.projects.length,
                        total: existingProjects.length
                    });

                } catch (error) {
                    reject(new Error('Ошибка при импорте: ' + error.message));
                }
            };

            reader.onerror = () => {
                reject(new Error('Ошибка при чтении файла'));
            };

            reader.readAsText(file);
        });
    }

    // Получение статистики хранилища
    getStorageStats() {
        const projects = this.getProjects();
        let totalSize = 0;
        let totalObjects = 0;

        projects.forEach(project => {
            const projectSize = JSON.stringify(project).length;
            totalSize += projectSize;
            totalObjects += project.scene?.objects?.length || 0;
        });

        return {
            projectCount: projects.length,
            totalObjects: totalObjects,
            totalSize: totalSize,
            formattedSize: this.formatBytes(totalSize)
        };
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}