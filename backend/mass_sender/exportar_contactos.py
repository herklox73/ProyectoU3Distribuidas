"""
Exportación de contactos a Excel (solo administradores).

El libro se arma en memoria con xlsx_rapido (escribe fila a fila y comprime
sobre la marcha: 300.000 contactos en pocos segundos) y se envía directo al
navegador. No se guarda ningún archivo en el servidor.
"""
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone

from .models import Contact
from .telefonos import normalizar_o_igual


def _telefono_legible(n):
    """Recibe el número ya normalizado."""
    if len(n) == 12 and n.startswith('593'):
        return f'+593 {n[3:5]} {n[5:8]} {n[8:]}'
    return n


def usuarios_con_contactos():
    """Lista de usuarios con cuántos contactos tiene cada uno (para el selector)."""
    User = get_user_model()
    conteo = dict(
        Contact.objects.values_list('owner_id').annotate(n=Count('id')).values_list('owner_id', 'n')
    )
    return [
        {'id': u.id, 'usuario': u.get_username(), 'admin': u.is_staff, 'contactos': conteo.get(u.id, 0)}
        for u in User.objects.filter(is_active=True).order_by('username')
    ]


def excel_contactos(usuario_id=None, etiqueta=''):
    """
    usuario_id: id de un usuario, o None para TODOS los usuarios.
    Devuelve (bytes, nombre_de_archivo).
    """
    from .xlsx_rapido import ESTILO_ENCABEZADO, ESTILO_TITULO, LibroRapido

    User = get_user_model()
    qs = Contact.objects.exclude(phone_number__contains='@')
    if usuario_id is not None:
        qs = qs.filter(owner_id=usuario_id)
    if etiqueta:
        qs = qs.filter(tags__icontains=etiqueta)
    filas = qs.order_by('owner__username', 'full_name', 'id').values_list(
        'owner__username', 'full_name', 'phone_number', 'tags', 'is_opted_out', 'created_at')

    libro = LibroRapido()
    hoja = libro.hoja('Contactos', anchos=[26, 30, 18, 17, 28, 15, 17], fijar_encabezado=True)
    hoja.fila(['Usuario', 'Nombre', 'Teléfono', 'Número (WhatsApp)', 'Etiquetas', 'Recibe mensajes', 'Creado'],
              estilo=ESTILO_ENCABEZADO)
    total = 0
    por_usuario = {}
    for dueno, nombre, tel, tags, baja, creado in filas.iterator(chunk_size=5000):
        dueno = dueno or '(sin dueño)'
        numero = normalizar_o_igual(tel or '')
        hoja.fila([
            dueno,
            nombre or '',
            _telefono_legible(numero),
            numero,
            tags or '',
            'No' if baja else 'Sí',
            timezone.localtime(creado) if creado else None,
        ])
        total += 1
        por_usuario[dueno] = por_usuario.get(dueno, 0) + 1

    res = libro.hoja('Resumen', anchos=[34, 14])
    res.fila(['Exportación de contactos - MassSend'], estilo=ESTILO_TITULO)
    res.fila([f"Generado: {timezone.localtime().strftime('%d/%m/%Y %H:%M')}"])
    if etiqueta:
        res.fila([f'Filtro de etiqueta: {etiqueta}'])
    res.fila([])
    res.fila(['Usuario', 'Contactos'], estilo=ESTILO_ENCABEZADO)
    for dueno, n in sorted(por_usuario.items()):
        res.fila([dueno, n])
    res.fila(['Total', total], estilo=ESTILO_TITULO)

    contenido = libro.cerrar()

    if usuario_id is None:
        quien = 'todos'
    else:
        u = User.objects.filter(pk=usuario_id).first()
        quien = (u.get_username() if u else str(usuario_id)).split('@')[0]
    quien = ''.join(ch if ch.isalnum() or ch in '-_' else '_' for ch in quien)
    return contenido, f"contactos_{quien}_{timezone.localdate().isoformat()}.xlsx"
