#!/usr/bin/env python3
import http.server
import socketserver
import socket

PORT = 8000
HOST = '0.0.0.0'


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Добавляем заголовки кэширования
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        self.send_header('Pragma', 'no-cache')  # для совместимости с HTTP/1.0
        self.send_header('Expires', '0')  # устаревший, но для надёжности
        super().end_headers()


# Устанавливаем правильные MIME-типы
CustomHTTPRequestHandler.extensions_map['.js'] = 'text/javascript'
CustomHTTPRequestHandler.extensions_map['.mjs'] = 'text/javascript'

with socketserver.TCPServer((HOST, PORT), CustomHTTPRequestHandler) as httpd:
    print(f"Сервер запущен на порту {PORT}")
    print("Доступен в локальной сети по адресам:")
    hostname = socket.gethostname()
    local_ips = socket.gethostbyname_ex(hostname)[2]
    for ip in local_ips:
        print(f"  http://{ip}:{PORT}/")
    print("Cache-Control: no-store, no-cache, must-revalidate")
    print("Нажмите Ctrl+C для остановки")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен")