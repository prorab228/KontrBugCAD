import http.server

HandlerClass = http.server.SimpleHTTPRequestHandler

# Исправляем MIME-тип для .js и .mjs файлов
HandlerClass.extensions_map['.js'] = 'text/javascript'
HandlerClass.extensions_map['.mjs'] = 'text/javascript'

# Запускаем сервер
http.server.test(HandlerClass, port=8000)