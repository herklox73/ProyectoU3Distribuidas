"""
Autenticación entre servicios internos (Django <-> gateway Node.js).

Django y el gateway de WhatsApp comparten un secreto, INTERNAL_API_TOKEN:
  - Django lo envía en la cabecera X-Internal-Token cuando llama al gateway
    (/api/send, /api/qr, /api/logout, ...).
  - El gateway lo envía cuando avisa a Django (/api/webhook/, /api/send-result/,
    /api/message-ack/), y Django rechaza los avisos que no lo traen.
  - Con el mismo secreto Django firma "tickets" de corta duración que el
    navegador usa para abrir el WebSocket del gateway; así solo un usuario
    con sesión iniciada puede recibir los mensajes del chat en tiempo real.

Si INTERNAL_API_TOKEN está vacío (desarrollo local), las comprobaciones se
desactivan para no romper el flujo de trabajo de siempre.
"""
import base64
import hashlib
import hmac
import json
import time

from django.conf import settings

HEADER = 'X-Internal-Token'
WS_TICKET_TTL_SECONDS = 60


def _token() -> str:
    return getattr(settings, 'INTERNAL_API_TOKEN', '') or ''


def internal_headers() -> dict:
    """Cabeceras que Django agrega a cada petición dirigida al gateway."""
    token = _token()
    return {HEADER: token} if token else {}


def is_internal_request(request) -> bool:
    """True si la petición trae el secreto compartido (o si no hay secreto configurado)."""
    token = _token()
    if not token:
        return True
    received = request.headers.get(HEADER, '')
    return hmac.compare_digest(received.encode(), token.encode())


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def make_ws_ticket(user) -> str:
    """Ticket firmado (HMAC-SHA256) que autoriza a abrir el WebSocket durante 60 s."""
    token = _token()
    if not token:
        return ''
    payload = _b64(json.dumps({'uid': user.pk, 'exp': int(time.time()) + WS_TICKET_TTL_SECONDS}).encode())
    signature = _b64(hmac.new(token.encode(), payload.encode(), hashlib.sha256).digest())
    return f'{payload}.{signature}'
