// config.js
export const CONFIG = {
    // Базовый URL API сервера (без завершающего слеша)
    API_URL: 'http://192.168.10.129:80',

    // Альтернативные URL для разных окружений (можно переключать по env)
    // API_URL: process.env.NODE_ENV === 'production' ? 'https://cloud.контрбагтех.рф' : 'http://192.168.10.129:80',

    // Версия приложения (можно забирать из package.json, но для простоты оставим здесь)
    APP_VERSION: '0.9.55',
    APP_NAME: 'КонтрCAD',
    APP_AUTHOR: 'Лунев Валерий Константинович'
};