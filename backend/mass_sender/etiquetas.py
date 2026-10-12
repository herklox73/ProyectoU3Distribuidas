"""
Etiquetas de contactos para segmentar campañas.

Una campaña guarda sus etiquetas separadas por coma en target_tags
("norte, sur"). Vacío = enviar a todos. Un contacto entra si tiene
CUALQUIERA de las etiquetas elegidas.
"""
import re

from django.db.models import Count, Q


def separar(texto):
    """'norte, sur ,, centro' -> ['norte', 'sur', 'centro'] (sin repetidos, en orden)."""
    vistas, salida = set(), []
    for parte in (texto or '').split(','):
        t = parte.strip()
        if t and t.lower() not in vistas:
            vistas.add(t.lower())
            salida.append(t)
    return salida


def filtrar(qs, texto):
    """
    Contactos que tengan al menos una de las etiquetas, comparando la etiqueta
    completa (sin distinguir mayúsculas): "sur" no incluye a "surco".
    """
    etiquetas = separar(texto)
    if not etiquetas:
        return qs
    condicion = Q()
    for t in etiquetas:
        condicion |= Q(tags__iregex=r'(^|,)\s*' + re.escape(t) + r'\s*(,|$)')
    return qs.filter(condicion)


def disponibles(qs_contactos):
    """Lista de etiquetas con cuántos contactos tiene cada una, de mayor a menor."""
    conteo = {}
    nombres = {}
    for tags, n in (qs_contactos.exclude(tags__isnull=True).exclude(tags='')
                    .values('tags').annotate(n=Count('id')).values_list('tags', 'n')):
        for t in separar(tags):
            k = t.lower()
            conteo[k] = conteo.get(k, 0) + n
            nombres.setdefault(k, t)
    return sorted(
        ({'etiqueta': nombres[k], 'contactos': v} for k, v in conteo.items()),
        key=lambda e: (-e['contactos'], e['etiqueta'].lower()),
    )
