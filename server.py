#!/usr/bin/env python3
"""
Статический сервер для локального тестирования редактора.

Зачем он нужен, если есть `npm run dev`:
    • запускается одной командой там, где нет Node.js (например, на чужой машине);
    • доступен в локальной сети — можно открыть редактор с телефона или планшета;
    • отключает кэш, поэтому правки в js/ видны сразу.

ИИ-ассистенту прокси не нужен: в десктопе он работает через встроенный
прокси (Electron main), в браузере — напрямую к API провайдера.
GigaChat-прокси, который раньше жил в этом файле, удалён.

Запуск:
    python server.py
"""
import http.server
import socket
import socketserver

PORT = 8000
HOST = '0.0.0.0'


class StaticHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Кэш выключен: иначе service worker и браузер показывают старые модули
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # CORS — чтобы можно было тестировать страницу с другого origin
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


# Модули должны отдаваться с корректным MIME, иначе браузер их не загрузит
StaticHandler.extensions_map['.js'] = 'text/javascript'
StaticHandler.extensions_map['.mjs'] = 'text/javascript'
StaticHandler.extensions_map['.json'] = 'application/json'
StaticHandler.extensions_map['.wasm'] = 'application/wasm'


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with ThreadingServer((HOST, PORT), StaticHandler) as httpd:
        print(f'Сервер запущен на порту {PORT}')
        print('Доступен в локальной сети по адресам:')
        try:
            for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
                print(f'  http://{ip}:{PORT}/')
        except OSError:
            pass
        print('Нажмите Ctrl+C для остановки')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nСервер остановлен')
