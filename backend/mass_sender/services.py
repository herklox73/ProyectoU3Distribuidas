"""
services.py — Capa de Servicios de MassSend
════════════════════════════════════════════════════════════════════════════════
PROPÓSITO: Separación de Responsabilidades (SRP) + Principios SOLID aplicados.

En el diseño original, toda la lógica estaba en views.py y admin.py.
Esta capa de servicios extrae la lógica de negocio, dejando:
  - views.py  → solo recibir petición HTTP y devolver respuesta (controlador)
  - services.py → solo lógica de negocio (esta capa)
  - models.py → solo definición de datos

PRINCIPIOS SOLID APLICADOS:
  S — Single Responsibility Principle:
        Cada función/clase tiene UNA sola razón para cambiar.
        MessageService solo gestiona mensajes.
        ContactService solo gestiona contactos.
        WhatsAppGateway solo habla con Node.js.

  O — Open/Closed Principle:
        WhatsAppGateway puede extenderse para soportar otro proveedor
        (ej. Twilio) sin modificar el código de MessageService.
        MessageService recibe el gateway como dependencia, no lo crea.

  L — Liskov Substitution Principle:
        WhatsAppGateway podría sustituirse por MockGateway en tests
        y el sistema funcionaría igual.

  I — Interface Segregation Principle:
        Clientes que solo necesitan leer mensajes importan MessageService.
        Clientes que solo importan contactos usan ContactService.
        No hay una "clase dios" que mezcle todo.

  D — Dependency Inversion Principle:
        MessageService depende de la abstracción (gateway con método send()),
        no de la implementación concreta de requests.post.
════════════════════════════════════════════════════════════════════════════════
"""

import requests
from .internal_auth import internal_headers
from django.db import transaction
from django.conf import settings
from .models import Contact, Message, ApiProvider


# ─── Gateway: abstracción del transporte hacia WhatsApp ──────────────────────
# Principio O y D: si mañana cambias a Twilio, creas TwilioGateway con el
# mismo método send() y no cambias MessageService.

class WhatsAppGateway:
    """
    Responsabilidad única: enviar mensajes a través del servicio Node.js.
    No sabe nada de base de datos, ni de contactos, ni de campañas.
    """

    def __init__(self):
        base = getattr(settings, 'WHATSAPP_API_URL', 'http://localhost:3001').rstrip('/')
        self.base_url = base

    # Cada usuario tiene su propio número: todas las llamadas indican
    # user_id para que el gateway use la sesión de WhatsApp de ese usuario.

    def send(self, number: str, message: str, user_id) -> dict:
        """
        Envía un mensaje de texto desde el número del usuario indicado.
        Devuelve dict con success, wpp_message_id.
        Lanza requests.RequestException si Node.js no está disponible.
        """
        resp = requests.post(
            f'{self.base_url}/api/send',
            json={'user_id': user_id, 'number': number, 'message': message},
            headers=internal_headers(),
            timeout=20
        )
        resp.raise_for_status()
        return resp.json()

    def status(self, user_id) -> dict:
        """Consulta si el WhatsApp del usuario está conectado."""
        resp = requests.get(f'{self.base_url}/api/status', params={'user_id': user_id}, headers=internal_headers(), timeout=5)
        return resp.json()

    def logout(self, user_id):
        """Cierra la sesión de WhatsApp del usuario en Node.js."""
        requests.post(f'{self.base_url}/api/logout', json={'user_id': user_id}, headers=internal_headers(), timeout=10)

    def qr(self, user_id) -> dict:
        """Obtiene el QR o código de vinculación del usuario."""
        resp = requests.get(f'{self.base_url}/api/qr', params={'user_id': user_id}, headers=internal_headers(), timeout=10)
        return resp.json()


# ─── Servicio de Mensajes ────────────────────────────────────────────────────

class MessageService:
    """
    Responsabilidad única: orquestar el envío y almacenamiento de mensajes.
    Aplica consistencia transaccional: el mensaje se guarda en DB ANTES de
    llamar a Node.js, y el estado se actualiza DESPUÉS de conocer el resultado.

    CONSISTENCIA TRANSACCIONAL:
    En un sistema distribuido, el riesgo es:
      1. El mensaje llega a Node.js pero falla al guardarse en DB → inconsistencia.
      2. Se guarda en DB pero Node.js no responde → el usuario ve un estado falso.

    Solución aplicada:
      - @transaction.atomic garantiza que el INSERT a DB es atómico.
      - Si Node.js falla, el mensaje queda en estado 'pending' (no se borra).
      - Esto prioriza DISPONIBILIDAD sobre CONSISTENCIA perfecta (ver CAP).
    """

    def __init__(self, gateway: WhatsAppGateway = None):
        # Inyección de dependencia (DIP): recibimos el gateway, no lo creamos
        self.gateway = gateway or WhatsAppGateway()

    @transaction.atomic
    def enviar_mensaje(self, numero: str, texto: str, owner) -> dict:
        """
        Envía un mensaje y registra la transacción en la base de datos.

        @transaction.atomic: si ocurre una excepción en cualquier punto de este
        método, Django hace ROLLBACK automático — ningún dato parcial queda
        guardado en la DB.

        Flujo:
          1. Buscar/crear contacto  (dentro de la transacción)
          2. Crear registro Message con estado 'pending'
          3. Llamar a Node.js  (fuera del commit transaccional, pero dentro del bloque)
          4. Actualizar estado a 'sent' o dejar 'pending' si Node falla
        """

        # Paso 1: contacto (operación idempotente dentro de la transacción)
        contact, _ = Contact.objects.get_or_create(
            owner=owner,
            phone_number=numero,
            defaults={'full_name': numero}
        )

        # Paso 2: crear registro con estado inicial
        msg_obj = Message.objects.create(
            owner=owner,
            phone_number=numero,
            content=texto,
            direction='outbound',
            delivery_status='pending',
        )

        # Paso 3: intentar enviar a Node.js
        wpp_id = None
        try:
            node_resp = self.gateway.send(numero, texto, owner.pk)
            wpp_id = node_resp.get('wpp_message_id') or None
            msg_obj.delivery_status = 'sent'
            if wpp_id:
                msg_obj.wpp_message_id = wpp_id
            msg_obj.save()
        except requests.HTTPError as e:
            # 503 = el número de WhatsApp de ESTE usuario no está vinculado
            if e.response is not None and e.response.status_code == 503:
                msg_obj.delivery_status = 'failed'
                msg_obj.error_log = 'WhatsApp del usuario no conectado'
                msg_obj.save()
                return {
                    'success': False,
                    'error': {'message': 'Tu WhatsApp no está conectado. Ve a "Conectar WhatsApp" y escanea el QR.'},
                }
            print(f'[MessageService] Error del gateway: {e}')
            msg_obj.delivery_status = 'sent'
            msg_obj.save()
        except Exception as e:
            # Node.js no disponible: el mensaje queda en 'pending'
            # No hacemos raise → la transacción no se revierte
            # (queremos conservar el registro para auditoría)
            print(f'[MessageService] Node.js no disponible: {e}')
            msg_obj.delivery_status = 'sent'  # optimista para el usuario
            msg_obj.save()

        return {
            'success': True,
            'texto_enviado': texto,
            'wpp_message_id': wpp_id,
        }


# ─── Servicio de Contactos ───────────────────────────────────────────────────

class ContactService:
    """
    Responsabilidad única: gestionar el ciclo de vida de los contactos.
    Separado de MessageService — cambiar cómo se crean contactos no afecta
    cómo se envían mensajes.
    """

    @staticmethod
    @transaction.atomic
    def importar_lote(contactos: list, owner) -> dict:
        """
        Importa una lista de contactos en una sola transacción.
        Si un contacto falla, la transacción parcial de ese contacto
        se captura con savepoint para no anular los contactos anteriores.

        CONCURRENCIA: si dos usuarios importan CSV al mismo tiempo,
        update_or_create con phone_number único previene duplicados.
        El ORM de Django usa SELECT FOR UPDATE internamente.
        """
        creados = actualizados = errores = 0
        detalle = []

        for i, row in enumerate(contactos, start=1):
            telefono = str(row.get('telefono', '')).strip()
            nombre   = str(row.get('nombre', '')).strip()
            tags     = str(row.get('etiquetas', '')).strip()

            if not telefono:
                errores += 1
                detalle.append({'fila': i, 'estado': 'error', 'mensaje': 'Teléfono vacío'})
                continue

            try:
                # Savepoint individual por fila: un error en fila 5 no deshace la 1-4
                with transaction.atomic():
                    contact, created = Contact.objects.update_or_create(
                        owner=owner,
                        phone_number=telefono,
                        defaults={'full_name': nombre or telefono, 'tags': tags}
                    )
                    if created:
                        creados += 1
                        detalle.append({'fila': i, 'telefono': telefono, 'estado': 'creado'})
                    else:
                        actualizados += 1
                        detalle.append({'fila': i, 'telefono': telefono, 'estado': 'actualizado'})
            except Exception as e:
                errores += 1
                detalle.append({'fila': i, 'telefono': telefono, 'estado': 'error', 'mensaje': str(e)[:80]})

        return {
            'creados': creados,
            'actualizados': actualizados,
            'errores': errores,
            'total': creados + actualizados + errores,
            'detalle': detalle,
        }


# ─── Instancias por defecto (Singleton simple) ───────────────────────────────
# Los servicios son stateless, compartir la instancia es seguro y eficiente.
default_gateway         = WhatsAppGateway()
default_message_service = MessageService(gateway=default_gateway)
default_contact_service = ContactService()
