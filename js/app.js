
// ===== ЗАЩИТА КОНТРБАГТЕХ =====
const ALLOWED_HOSTS = ['prorab228.github.io', 'cad.xn--80abhivsgrre8a.xn--p1ai', 'контрбагтех.рф' ,'cad.контрбагтех.рф'];
const isElectron = navigator.userAgent.includes('Electron');
if (!isElectron && !ALLOWED_HOSTS.includes(window.location.hostname)) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;background:#1a1a1a;color:white;height:100vh;display:flex;align-items:center;justify-content:center;"><div><h2 style="color:#ff9800;">Доступ ограничен</h2><p>Редактор КонтрБагCAD работает только на официальном сайте.</p><p><a href="https://cad.xn--80abhivsgrre8a.xn--p1ai/" style="color:#4CAF50;">Перейти на официальную страницу</a></p></div></div>';
    throw new Error('Access denied: Используйте официальный сайт.');
}
// ===== КОНЕЦ ЗАЩИТЫ =====

import{CADEditor}from"./core/CADEditor.js";document.addEventListener("DOMContentLoaded",()=>{window.cadEditor=new CADEditor});