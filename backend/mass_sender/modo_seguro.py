"""
Modo seguro de envío.

WhatsApp restringe (error 463) o desconecta (401 conflict) a los números que
mandan muchos mensajes seguidos a contactos que no los tienen guardados,
sobre todo si el número es nuevo. Para parecer un envío humano:

  1. Pausa aleatoria entre mensajes (por defecto de 20 a 60 s) y, cada
     cierta cantidad de mensajes, una pausa larga (de 5 a 12 min).
  2. Límite diario por número (por defecto 50). Lo que pase del límite se
     envía al día siguiente desde las 08:00 (hora de Ecuador).
  3. Pausa automática si el WhatsApp se desconecta o aparecen bloqueos.

Las pausas largas y la hora de reanudación se ajustan con variables de
entorno; el límite diario y las pausas entre mensajes, desde la página
de WhatsApp de cada usuario.
"""
import os
import random
from datetime import timedelta

from django.utils import timezone


def _entero(nombre, defecto):
    try:
        return int(os.environ.get(nombre, defecto))
    except (TypeError, ValueError):
        return defecto


# Pausa larga cada cierta cantidad de mensajes (al azar entre MIN y MAX)
CADA_MIN = _entero('ENVIO_PAUSA_LARGA_CADA_MIN', 8)
CADA_MAX = _entero('ENVIO_PAUSA_LARGA_CADA_MAX', 15)
PAUSA_LARGA_MIN = _entero('ENVIO_PAUSA_LARGA_MIN', 300)    # 5 min
PAUSA_LARGA_MAX = _entero('ENVIO_PAUSA_LARGA_MAX', 720)    # 12 min
# Hora local a la que siguen las campañas que llegaron al límite diario
HORA_REANUDAR = _entero('ENVIO_HORA_REANUDAR', 8)
# Bloqueos (error 463) en una misma tanda que pausan la campaña
UMBRAL_BLOQUEOS = _entero('ENVIO_UMBRAL_BLOQUEOS', 3)
# Sin latido por más de esto, el hilo de envío ya no existe
LATIDO_VENCIDO = timedelta(minutes=3)

# Valores permitidos desde la página
LIMITE_MAX = 5000
PAUSA_MIN_PERMITIDA = 5
PAUSA_MAX_PERMITIDA = 600


def config_de(owner_id):
    from .models import ConfigEnvio
    cfg, _ = ConfigEnvio.objects.get_or_create(owner_id=owner_id)
    return cfg


def pausa_entre_mensajes(cfg):
    bajo = max(PAUSA_MIN_PERMITIDA, cfg.pausa_min)
    alto = max(bajo, cfg.pausa_max)
    return random.uniform(bajo, alto)


def siguiente_pausa_larga():
    """Cuántos mensajes enviar antes de la próxima pausa larga."""
    return random.randint(CADA_MIN, max(CADA_MIN, CADA_MAX))


def pausa_larga():
    return random.uniform(PAUSA_LARGA_MIN, max(PAUSA_LARGA_MIN, PAUSA_LARGA_MAX))


def inicio_de_hoy():
    ahora = timezone.localtime()
    return ahora.replace(hour=0, minute=0, second=0, microsecond=0)


def enviados_hoy(owner_id):
    """
    Mensajes de campaña que salieron hoy desde el número del usuario.
    Los 'failed' no cuentan: nunca llegaron a WhatsApp (sin WhatsApp,
    desconectado, cancelado). Los bloqueados sí: WhatsApp los vio.
    """
    from .models import Message
    return (Message.objects
            .filter(owner_id=owner_id, direction='outbound', campaign__isnull=False,
                    sent_at__gte=inicio_de_hoy())
            .exclude(delivery_status='failed')
            .count())


def proxima_reanudacion():
    """Mañana a la HORA_REANUDAR, hora local."""
    manana = inicio_de_hoy() + timedelta(days=1)
    return manana.replace(hour=HORA_REANUDAR)


def hilo_vivo(progress):
    """True si hay un hilo enviando (o esperando) esta campaña ahora mismo."""
    if not progress or not progress.latido:
        return False
    return timezone.now() - progress.latido < LATIDO_VENCIDO


def uso_de(owner_id):
    cfg = config_de(owner_id)
    hoy = enviados_hoy(owner_id)
    return {
        'limite_diario': cfg.limite_diario,
        'pausa_min': cfg.pausa_min,
        'pausa_max': cfg.pausa_max,
        'enviados_hoy': hoy,
        'restantes_hoy': None if cfg.limite_diario == 0 else max(0, cfg.limite_diario - hoy),
        'hora_reanudar': HORA_REANUDAR,
    }
