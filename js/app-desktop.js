import { CADEditor } from './core/CADEditor.js';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { ModelPreviewGenerator } from './utils/ModelPreviewGenerator.js';
import { CONFIG } from '../config.js';
// ★ ДОБАВЛЕНО: Импорт встроенных диалогов (проверьте правильность пути в вашем проекте)
import { Dialogs } from './ui/Dialogs.js';

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================
async function initApp() {
    // ★ КРИТИЧЕСКИ ВАЖНО: Подтверждаем загрузку СРАЗУ, до инициализации CADEditor.
    // Это предотвращает автоматический откат обновления.
    // ★ Гарантируем, что top-level await не повесит весь модуль.
    // Если notifyAppReady зависнет больше 3 секунд — идём дальше.
    if (window.electronUpdater && typeof window.electronUpdater.notifyAppReady === 'function') {
        console.log('[boot] notifyAppReady: start');
        try {
            await Promise.race([
                window.electronUpdater.notifyAppReady(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('notifyAppReady timeout')), 3000))
            ]);
            console.log('[boot] notifyAppReady: ok');
        } catch (e) {
            console.warn('[boot] notifyAppReady: failed/timeout →', e.message);
        }
    } else {
        console.log('[boot] notifyAppReady: skipped (no electronUpdater)');
    }
    console.log('[boot] app-desktop.js продолжает загрузку');

    // ============================================================
    //  СОЗДАНИЕ РЕДАКТОРА
    // ============================================================
    window.cadEditor = new CADEditor();

    // ОТЛАДКА: Проверяем, работает ли preload
    if (window.electronAPI) {
        console.log("✅ preload.js успешно загружен. electronAPI доступен.");
    } else {
        console.error("❌ ОШИБКА: preload.js НЕ загружен. window.electronAPI пуст!");
    }

    // Получаем апдейтер из preload.js
    const updater = window.electronUpdater;
    if (updater) {
        // await updater.notifyAppReady();
        initLiveUpdateUI(updater);
    }

    initAddModelModal();

    const addBtn = document.getElementById('addSelectedToLibraryBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            if (window.openAddModelModal) window.openAddModelModal();
        });
    }

    // Подписка на события меню
    if (window.electronAPI?.onMenuEvent) {
        window.electronAPI.onMenuEvent((command) => {
            console.log('Menu command received:', command);
            const editor = window.cadEditor;
            if (!editor) return;

            switch (command) {
                case 'new-project': editor.projectManager.newProject(); break;
                case 'open-project': editor.projectManager.openProject(); break;
                case 'save-project': editor.projectManager.showSaveModal(); break;
                case 'export': editor.exportManager.showExportModal(); break;
                case 'duplicate': editor.duplicateSelectedObjects(); break;
                case 'selectAll': editor.selectAllObjects(); break;
                case 'undo': editor.undo(); break;
                case 'redo': editor.redo(); break;
                case 'copy': editor.copySelectedObjects(); break;
                case 'paste': editor.pasteSelectedObjects(); break;
                case 'delete': editor.deleteSelected(); break;
                case 'about':
                    document.getElementById('aboutModal').classList.add('active');
                    break;
                case 'check-updates':
                    if (updater) {
                        checkForUpdates(updater, null);
                    }
                    break;
                default:
                    console.warn('Unknown menu command:', command);
            }
        });
    }
}

// ★ Надёжный запуск: срабатывает и в случае, когда DOMContentLoaded уже прошёл
// (например, если модуль грузится долго или есть top-level await внутри initApp).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // DOMContentLoaded уже выстрелил до загрузки модуля — запускаем сразу
    initApp();
}

// ==========================================
// ЛОГИКА LIVE-UPDATE
// ==========================================
async function checkForUpdates(updater, updateBtn = null) {
    console.log('Запуск проверки обновлений...');

    if (updateBtn) {
        updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
        updateBtn.disabled = true;
    }

    try {
        // Берем токен и URL напрямую из AuthService
        const auth = window.cadEditor?.accountManager?.auth;
        const token = auth?.token;
        const serverUrl = auth?.serverUrl || 'https://www.kontrcad.ru';

        if (!token) {
            await Dialogs.alert('Для проверки обновлений необходимо авторизоваться в редакторе.', 'Авторизация');
            return;
        }

        // Запрос к серверу
        const response = await fetch(`${serverUrl}/api/latest-update`, {
            method: 'GET',
            cache: 'no-store',                     // ★ запрет HTTP-кэша
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
        });

        if (response.status === 403) {
            const errData = await response.json();
            await Dialogs.alert(errData.error || 'Доступ к обновлениям ограничен вашим тарифом.', 'Доступ ограничен');
            return;
        }

        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }

        const latest = await response.json();
        const currentVersion = CONFIG?.APP_VERSION || '0.0.0';

        console.log(`Текущая версия: ${currentVersion}, Доступная: ${latest.version}`);

        if (latest.version === currentVersion) {
            await Dialogs.alert('У вас уже установлена последняя версия ядра.', 'Обновление');
            return;
        }

        // ★ ДОБАВЛЕНО: Запрос подтверждения перед скачиванием
        const confirmMessage = `Доступна новая версия ядра: ${latest.version}\nВаша текущая версия: ${currentVersion}\n\nСкачать и установить обновление?`;

        let isConfirmed = false;
        try {
            if (Dialogs && typeof Dialogs.confirm === 'function') {
                isConfirmed = await Dialogs.confirm(confirmMessage, 'Доступно обновление');
            }
        } catch (e) {
            console.warn('[LiveUpdate] Dialogs.confirm упал, используем window.confirm:', e);
        }

        if (!isConfirmed) {
            isConfirmed = window.confirm(
                `Доступна новая версия ядра: ${latest.version}\n` +
                `Ваша текущая версия: ${currentVersion}\n\n` +
                `Скачать и установить обновление?`
            );
        }

        if (!isConfirmed) {
            console.log('Пользователь отменил скачивание обновления.');
            return;
        }

        if (updateBtn) updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Скачивание...';

        console.log('Начинаем скачивание бандла обновления...');
        // ★ Cache-busting: гарантирует, что CDN/прокси отдаст свежий ZIP,
        // а не закэшированный со старым содержимым
        const downloadUrl = `${latest.url}${latest.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
        console.log('[LiveUpdate] Скачиваем:', downloadUrl);

        const bundle = await updater.download({
            url: downloadUrl,
            version: latest.version,
            checksum: latest.checksum,
        });

        // Применяем обновление немедленно
        await updater.set({ id: bundle.id });

        // set() сам перезагрузит приложение. Предупреждаем пользователя.
        await Dialogs.alert('Обновление применено! Приложение будет перезагружено.', 'Успех');

        // Принудительная перезагрузка на случай, если set() не сработал
        window.location.reload();

    } catch (e) {
        console.error('Ошибка обновления:', e);
        await Dialogs.alert('Ошибка при обновлении: ' + e.message, 'Ошибка');
    } finally {
        if (updateBtn) {
            updateBtn.innerHTML = '<i class="fas fa-sync"></i> Проверить обновления';
            updateBtn.disabled = false;
        }
    }
}

// ==========================================
// UI ДЛЯ LIVE-UPDATE (Кнопка в настройках)
// ==========================================
function initLiveUpdateUI(updater) {
    const settingsBlock = document.querySelector('#settings .dropdown-menu');
    if (!settingsBlock) return;

    const section = document.createElement('div');
    section.className = 'dropdown-section';
    section.innerHTML = `<h4>Обновление ядра</h4>`;

    const updateBtn = document.createElement('button');
    updateBtn.className = 'btn-small';
    updateBtn.style = "width: 100%; margin-top: 8px; background: #2196f3; color: white; border: none;";
    updateBtn.innerHTML = '<i class="fas fa-sync"></i> Проверить обновления';

    // Добавляем stopPropagation, чтобы клик не закрывал выпадающее меню настроек
    updateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        checkForUpdates(updater, updateBtn);
    });

    section.appendChild(updateBtn);
    settingsBlock.insertBefore(section, settingsBlock.firstChild);
}

// ==========================================
// ДОБАВЛЕНИЕ МОДЕЛИ В БИБЛИОТЕКУ
// ==========================================
function initAddModelModal() {
    const modal = document.getElementById('addModelModal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.close-modal');
    const cancelBtn = document.getElementById('cancelAddModel');
    const confirmBtn = document.getElementById('confirmAddModel');
    const nameInput = document.getElementById('modelNameInput');
    const categorySelect = document.getElementById('modelCategorySelect');
    const colorInput = document.getElementById('modelColorInput');

    const closeModal = () => {
        modal.classList.remove('active');
        nameInput.value = '';
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    window.openAddModelModal = () => {
        const editor = window.cadEditor;
        if (!editor) return;
        const selected = editor.selectedObjects;
        if (!selected || selected.length === 0) {
            alert('Нет выделенных объектов');
            return;
        }
        if (selected[0].name) nameInput.value = selected[0].name;
        else nameInput.value = 'Модель';
        modal.classList.add('active');
    };

    confirmBtn?.addEventListener('click', async () => {
        const editor = window.cadEditor;
        if (!editor) return;
        const selected = editor.selectedObjects;
        if (!selected || selected.length === 0) { alert('Нет выделенных объектов'); closeModal(); return; }

        const modelName = nameInput.value.trim();
        if (!modelName) { alert('Введите название модели'); return; }

        const category = categorySelect?.value || 'user';
        const color = colorInput?.value.replace('#', '0x') || '0x8BC34A';
        const meshes = collectMeshes(selected);
        if (meshes.length === 0) { alert('Выделенные объекты не содержат мешей'); return; }

        const exporter = new STLExporter();
        const group = createExportGroup(meshes, true);
        const stlBuffer = exporter.parse(group, { binary: true });

        let previewData = null;
        try {
            const previewGenerator = new ModelPreviewGenerator();
            const previewGroup = group.clone();
            previewData = await previewGenerator.generatePreview(previewGroup, 128, 128);
            previewGenerator.dispose();
        } catch (err) { console.warn('Не удалось сгенерировать превью:', err); }

        if (!window.electronAPI?.addModelToLibrary) { alert('Функция доступна только в десктопной версии'); closeModal(); return; }

        try {
            const result = await window.electronAPI.addModelToLibrary({
                fileName: `${modelName}.stl`.replace(/[^a-zа-яё0-9_.-]/gi, '_'),
                fileData: Array.from(new Uint8Array(stlBuffer)),
                modelName: modelName, category: category, color: color, previewData: previewData
            });

            if (result.success) {
                alert('Модель успешно добавлена в библиотеку');
                if (editor.libraryManager) {
                    editor.libraryManager.libraryItems = [];
                    editor.libraryManager.categoryItemsCache.clear();
                    editor.libraryManager.modelCache.clear();
                    await editor.libraryManager.loadCategories();
                    const userBtn = document.querySelector('.filter-btn[data-filter="user"]');
                    if (userBtn) userBtn.click();
                }
            } else { alert('Ошибка: ' + result.error); }
        } catch (err) { alert('Ошибка связи с основным процессом'); console.error(err); }
        closeModal();
    });
}

function collectMeshes(objects) {
    const meshes = [];
    const traverse = (obj) => { if (obj.isMesh) meshes.push(obj); if (obj.children) obj.children.forEach(traverse); };
    objects.forEach(traverse);
    return meshes;
}

function createExportGroup(meshes, applyTransform = true) {
    const group = new THREE.Group();
    meshes.forEach(mesh => {
        const clone = mesh.clone();
        if (applyTransform) {
            mesh.updateMatrixWorld(true);
            clone.geometry = clone.geometry.clone();
            clone.geometry.applyMatrix4(mesh.matrixWorld);
            clone.position.set(0, 0, 0);
            clone.rotation.set(0, 0, 0);
            clone.scale.set(1, 1, 1);
        }
        group.add(clone);
    });
    group.rotation.x = Math.PI / 2;
    group.updateMatrixWorld(true);
    return group;
}