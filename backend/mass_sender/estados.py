"""
Estados de entrega de los mensajes salientes (las "palomitas" de WhatsApp).

Flujo:
  1. Django crea el mensaje como 'pending' con un ID propio (nuevo_id_mensaje)
     y se lo pasa al gateway, que lo envía a WhatsApp con ese mismo ID.
  2. El gateway avisa 'sent' (o 'failed') en /api/send-result/.
  3. WhatsApp avisa 'delivered' (✓✓ gris) y 'read' (✓✓ azul); el gateway los
     reenvía a /api/message-ack/ con el ID, y Django actualiza la fila.

Los avisos pueden llegar desordenados (por ejemplo 'read' antes que 'sent'),
así que un estado nunca retrocede: 'read' no vuelve a 'delivered'.
"""
import secrets

# 'blocked': WhatsApp rechazó el mensaje porque restringió el número (error 463)
RANGO = {'pending': 0, 'sent': 1, 'failed': 1, 'blocked': 1, 'delivered': 2, 'read': 3}


def nuevo_id_mensaje() -> str:
    """ID con el mismo formato que usa WhatsApp Web ("3EB0" + 18 hex)."""
    return '3EB0' + secrets.token_hex(9).upper()


def puede_cambiar(actual: str, nuevo: str) -> bool:
    if nuevo not in RANGO:
        return False
    if nuevo in ('failed', 'blocked'):
        # Solo falla / se bloquea lo que aún no llegó al celular
        return actual in ('pending', 'sent')
    return RANGO[nuevo] > RANGO.get(actual, 0)


def aplicar_estado(msg, nuevo: str, wpp_id: str = '') -> bool:
    """Cambia el estado del mensaje si no es un retroceso. Devuelve True si cambió algo."""
    campos = []
    if wpp_id and not msg.wpp_message_id:
        msg.wpp_message_id = wpp_id
        campos.append('wpp_message_id')
    if puede_cambiar(msg.delivery_status, nuevo):
        msg.delivery_status = nuevo
        campos.append('delivery_status')
    if campos:
        msg.save(update_fields=campos)
    return 'delivery_status' in campos
