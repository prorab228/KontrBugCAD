#!/usr/bin/env python3
import http.server
import socketserver
import socket
import json
import os
import ssl
import time
import uuid
import urllib.request
import urllib.parse
import urllib.error

PORT = 8000
HOST = '0.0.0.0'

# ==========================================================================
#  GigaChat-прокси
# ==========================================================================
GIGACHAT_AUTH_KEY = os.environ.get('GIGACHAT_AUTH_KEY', 'MDFhMWFmMmEtMGE3MS03MWQ3LTliZWEtYjQwYTRiMTNiYmYxOjE5ZDdhMzRkLWM1NzYtNGVkZi1hNDM2LTU3MjUwNDVkMTgwMQ==').strip()
GIGACHAT_SCOPE    = os.environ.get('GIGACHAT_SCOPE',    'GIGACHAT_API_PERS')

# ── АКТУАЛЬНЫЕ АДРЕСА (согласно документации Sber, 2026) ──────────────────
OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'  # получение токена
CHAT_URL  = 'https://api.giga.chat/v1/chat/completions'          # ★ новый адрес

# Sber использует сертификаты российского УЦ, которых нет в certifi.
# Для локального прокси отключаем проверку сертификата на этих хостах.
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

_token_cache = {'token': None, 'expires_at': 0.0}


def get_gigachat_token():
    """OAuth 2.0 Client Credentials: обменивает Authorization Key на access_token."""
    now = time.time()
    if _token_cache['token'] and now < _token_cache['expires_at'] - 60:
        return _token_cache['token']

    if not GIGACHAT_AUTH_KEY:
        raise RuntimeError(
            'GIGACHAT_AUTH_KEY не задан. '
            'Задайте переменную окружения перед запуском сервера.'
        )

    # В заголовке Authorization — Basic-схема с Authorization Key
    auth = GIGACHAT_AUTH_KEY
    if not auth.startswith('Basic '):
        auth = 'Basic ' + auth

    body = urllib.parse.urlencode({'scope': GIGACHAT_SCOPE}).encode()
    req = urllib.request.Request(
        OAUTH_URL,
        data=body,
        method='POST',
        headers={
            'Content-Type':  'application/x-www-form-urlencoded',
            'Accept':        'application/json',
            'RqUID':         str(uuid.uuid4()),
            'Authorization': auth,
        },
    )
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as e:
        raise RuntimeError(
            f'Не удалось подключиться к OAuth-серверу GigaChat ({OAUTH_URL}). '
            f'Проверьте сеть/файрвол/порт 9443. Детали: {e}'
        ) from e

    token = data.get('access_token')
    if not token:
        raise RuntimeError(f'OAuth не вернул access_token: {data}')

    expires_ms = data.get('expires_at')
    expires_at = (expires_ms / 1000.0) if expires_ms else (now + 30 * 60)
    _token_cache['token']      = token
    _token_cache['expires_at'] = expires_at
    print(f"[proxy] OAuth-токен получен, действует до "
          f"{time.strftime('%H:%M:%S', time.localtime(expires_at))}")
    return token


def proxy_chat(payload_bytes: bytes):
    """Прозрачно прогоняет тело запроса в GigaChat, добавляя OAuth-токен."""
    token = get_gigachat_token()
    req = urllib.request.Request(
        CHAT_URL,
        data=payload_bytes,
        method='POST',
        headers={
            'Content-Type':  'application/json',
            'Accept':        'application/json',
            'Authorization': f'Bearer {token}',
        },
    )
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX, timeout=180) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        raise RuntimeError(
            f'Не удалось подключиться к GigaChat API ({CHAT_URL}). '
            f'Проверьте сеть/файрвол. Детали: {e}'
        ) from e


# ==========================================================================
#  HTTP-обработчик
# ==========================================================================
class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    # ── OPTIONS (CORS preflight) ──────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    # ── GET: health-check + обычная раздача файлов ────────────────────────
    def do_GET(self):
        if self.path == '/api/health':
            return self._json(200, {
                'ok':            True,
                'has_auth_key':  bool(GIGACHAT_AUTH_KEY),
                'scope':         GIGACHAT_SCOPE,
                'oauth_url':     OAUTH_URL,
                'chat_url':      CHAT_URL,
                'token_cached':  bool(_token_cache['token']),
            })
        return super().do_GET()

    # ── POST /api/gigachat/chat ───────────────────────────────────────────
    def do_POST(self):
        if self.path == '/api/gigachat/chat':
            return self._handle_proxy_chat()
        self.send_error(404, 'Not Found')

    def _handle_proxy_chat(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length) if length else b''
            json.loads(raw.decode('utf-8'))  # валидация JSON
        except Exception as e:
            return self._json(400, {'error': f'Неверный JSON: {e}'})

        try:
            status, body = proxy_chat(raw)
        except Exception as e:
            return self._json(502, {'error': f'{type(e).__name__}: {e}'})

        self.send_response(status)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


CustomHTTPRequestHandler.extensions_map['.js']  = 'text/javascript'
CustomHTTPRequestHandler.extensions_map['.mjs'] = 'text/javascript'


# ==========================================================================
#  Запуск
# ==========================================================================
class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    if not GIGACHAT_AUTH_KEY:
        print('⚠  GIGACHAT_AUTH_KEY не задан — /api/gigachat/chat вернёт 502.')
        print('   Задайте его:  set GIGACHAT_AUTH_KEY=ваш_ключ   (Windows cmd)')
        print('                 export GIGACHAT_AUTH_KEY=ваш_ключ  (Linux/Mac)\n')

    with ThreadingServer((HOST, PORT), CustomHTTPRequestHandler) as httpd:
        print(f"Сервер запущен на порту {PORT}")
        print("Доступен в локальной сети по адресам:")
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            print(f"  http://{ip}:{PORT}/")
        print(f"  GigaChat-прокси: http://localhost:{PORT}/api/gigachat/chat")
        print(f"  Health-check:    http://localhost:{PORT}/api/health")
        print("Нажмите Ctrl+C для остановки")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nСервер остановлен")