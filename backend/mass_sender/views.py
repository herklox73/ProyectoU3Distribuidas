from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.views.decorators.clickjacking import xframe_options_exempt
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages as django_messages, admin
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q
from django.conf import settings
import json
import re
import requests
import csv
import io
import threading
from datetime import datetime, timedelta
from .models import Contact, Message, ApiProvider, Campaign, CampaignProgress
from .services import default_message_service
from .internal_auth import internal_headers, is_internal_request, make_ws_ticket
from .telefonos import normalizar_telefono
from .estados import RANGO, aplicar_estado, puede_cambiar
from . import reportes

def _whatsapp_url(path):
    """Devuelve la URL completa del servicio WhatsApp API."""
    base = getattr(settings, 'WHATSAPP_API_URL', 'http://localhost:3001').rstrip('/')
    return f"{base}{path}"


def _get_user(request):
    """
    Devuelve el usuario autenticado ya sea por JWT o por sesión Django.
    Retorna None si no está autenticado.
    """
    # Intentar JWT primero
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
    try:
        result = JWTAuthentication().authenticate(request)
        if result:
            return result[0]
    except (InvalidToken, TokenError):
        pass
    # Fallback: sesión Django
    if request.user.is_authenticated:
        return request.user
    return None


def _internal_owner(data):
    """Usuario dueño del número de WhatsApp en los avisos que manda el gateway."""
    from django.contrib.auth import get_user_model
    uid = data.get('user_id')
    if uid in (None, ''):
        return None
    return get_user_model().objects.filter(pk=uid).first()


def _es_dueno_o_staff(user, campana):
    """
    True si el usuario puede acceder a la campaña: es el dueño registrado
    o tiene permisos de staff/superusuario (panel administrativo).
    Corrige el IDOR reportado en api_campanas_media, donde cualquier
    usuario autenticado podía leer el archivo de cualquier campaña.
    """
    if user.is_staff:
        return True
    return campana.owner_id == user.id



@staff_member_required
@xframe_options_exempt
def chat_view(request):
    provider = ApiProvider.objects.filter(is_active=True).first()
    return render(request, 'mass_sender/chat.html', {'provider': provider})

MAX_CHATS = 300                 # conversaciones que carga el chat
MAX_CHATS_SIN_MENSAJES = 2000   # hasta este tamaño de libreta se listan también contactos sin mensajes
MAX_MENSAJES_CHAT = 200         # últimos mensajes por conversación


def api_leer_mensajes(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    provider = ApiProvider.objects.filter(is_active=True).first()
    from django.db.models import Max

    # Conversaciones: las 300 más recientes con mensajes (antes se recorrían
    # TODOS los contactos con una consulta cada uno, lo que no aguanta
    # libretas de cientos de miles de contactos).
    ultimos = (
        Message.objects.filter(owner=user).exclude(phone_number__contains='@')
        .values('phone_number').annotate(ultimo=Max('sent_at')).order_by('-ultimo')[:MAX_CHATS]
    )
    telefonos = [u['phone_number'] for u in ultimos]
    contactos_por_tel = {
        c.phone_number: c
        for c in Contact.objects.filter(owner=user, phone_number__in=telefonos)
    }
    contacts = [contactos_por_tel[t] for t in telefonos if t in contactos_por_tel]
    # Con libretas pequeñas también se listan los contactos sin mensajes
    # (para poder empezar a escribirles desde el chat), como antes.
    base = Contact.objects.filter(owner=user).exclude(phone_number__contains='@')
    if base.count() <= MAX_CHATS_SIN_MENSAJES:
        ya = set(contactos_por_tel)
        contacts += [c for c in base.order_by('-created_at') if c.phone_number not in ya]

    mensajes_por_tel = {}
    for m in (Message.objects.filter(owner=user, phone_number__in=[c.phone_number for c in contacts])
              .order_by('sent_at')):
        mensajes_por_tel.setdefault(m.phone_number, []).append(m)

    mensajes_dict = {}

    for contact in contacts:
        num = contact.phone_number
        if num.startswith('+'):
            num = num[1:]

        mensajes_qs = mensajes_por_tel.get(contact.phone_number, [])[-MAX_MENSAJES_CHAT:]

        msgs_list = []
        for m in mensajes_qs:
            msgs_list.append({
                "direccion":      "OUT" if m.direction == "outbound" else "IN",
                # 'tipo' es el campo que usa el JS para detectar si el mensaje es enviado
                "tipo":           "enviado" if m.direction == "outbound" else "recibido",
                "texto":          m.content or "",
                "fecha":          timezone.localtime(m.sent_at).strftime('%Y-%m-%d') if m.sent_at else "",
                "hora":           timezone.localtime(m.sent_at).strftime('%H:%M') if m.sent_at else "",
                # 'status' es el campo que usa el JS para mostrar los ticks
                "status":         m.delivery_status or "sent",
                "wpp_message_id": getattr(m, 'wpp_message_id', '') or "",
            })

        nombre_display = contact.full_name or ('+' + num)

        mensajes_dict[num] = {
            "nombre":      nombre_display,
            # custom_name es lo que el JS usa en la lista de chats
            "custom_name": contact.full_name or "",
            "foto":        f"https://ui-avatars.com/api/?name={contact.full_name or num}&background=4f46e5&color=fff",
            "no_leidos":   0,
            "mensajes":    msgs_list,
            "etiqueta":    contact.tags or "",
        }

    return JsonResponse({
        "has_changes": True,
        "timestamp":   999999999,
        "mensajes":    mensajes_dict,
        "account_info": {
            "business_name":  "MassSend",
            "display_number": provider.display_number if provider else "0000"
        }
    })

@csrf_exempt
def api_enviar_whatsapp(request):
    """
    Vista: recibe la petición HTTP y delega la lógica al servicio.
    Principio SRP: la vista NO sabe cómo se envía el mensaje, solo coordina.
    Principio D: depende de default_message_service (abstracción), no de requests.post.

    CONSISTENCIA TRANSACCIONAL:
    La lógica atómica está en MessageService.enviar_mensaje(), decorada con
    @transaction.atomic. Si el proceso falla a mitad, Django hace rollback.
    """
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if request.method == 'POST':
        try:
            data   = json.loads(request.body)
            numero = data.get('to')
            mensaje = data.get('message')

            if not numero or not mensaje:
                return JsonResponse({"success": False, "error": {"message": "Faltan parámetros"}})

            # Delegar al servicio — vista queda limpia y testeable
            resultado = default_message_service.enviar_mensaje(numero, mensaje, user)
            return JsonResponse(resultado)

        except Exception as e:
            return JsonResponse({"success": False, "error": {"message": str(e)}})
    return JsonResponse({"success": False})

@csrf_exempt
def api_webhook(request):
    """
    Recibe mensajes entrantes desde Node.js.

    CONSISTENCIA TRANSACCIONAL con @transaction.atomic:
    El contacto y el mensaje se crean en una sola transacción.
    Si falla la creación del mensaje, el contacto tampoco se crea
    (o viceversa) — no quedan registros huérfanos.

    CONCURRENCIA: si dos mensajes del mismo número llegan simultáneamente,
    get_or_create usa SELECT + INSERT atómico — el ORM garantiza que no
    se creen dos contactos con el mismo número (unique constraint).
    """
    if not is_internal_request(request):
        return JsonResponse({'error': 'No autorizado'}, status=403)
    if request.method == 'POST':
        try:
            data   = json.loads(request.body)
            numero = data.get('from')
            mensaje = data.get('body')

            if not numero or '@' in str(numero):
                return JsonResponse({"success": True, "skipped": True})

            if numero and mensaje:
                owner = _internal_owner(data)   # dueño del número que recibió el mensaje
                with transaction.atomic():
                    # get_or_create es atómico: no produce duplicados bajo concurrencia
                    contact, _ = Contact.objects.get_or_create(
                        owner=owner,
                        phone_number=numero,
                        defaults={'full_name': numero}
                    )
                    Message.objects.create(
                        owner=owner,
                        phone_number=numero,
                        content=mensaje,
                        direction='inbound'
                    )
            return JsonResponse({"success": True})
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})
    return JsonResponse({"success": False})

@csrf_exempt
def api_message_ack(request):
    """
    Llamado por el gateway cuando WhatsApp avisa un cambio de estado de un
    mensaje saliente: 'sent', 'delivered' (✓✓ gris), 'read' (✓✓ azul) o 'failed'.
    Se busca el mensaje por su ID de WhatsApp. Solo para mensajes antiguos sin
    ID se usa como respaldo el número. Un estado nunca retrocede (ver estados.py).
    """
    if not is_internal_request(request):
        return JsonResponse({'error': 'No autorizado'}, status=403)
    if request.method != 'POST':
        return JsonResponse({"success": False}, status=405)

    try:
        data   = json.loads(request.body)
        wpp_id = (data.get('wpp_message_id') or '').strip()
        number = re.sub(r'\D', '', str(data.get('number') or ''))
        status = data.get('status', '')

        if status not in RANGO:
            return JsonResponse({"success": False, "error": "Estado desconocido"}, status=400)

        # Solo se tocan mensajes del dueño del número que envió el aviso
        base_qs = Message.objects.filter(owner=_internal_owner(data), direction='outbound')

        msg = base_qs.filter(wpp_message_id=wpp_id).first() if wpp_id else None

        if not msg and number:
            # Respaldo: el mensaje más reciente a ese número que no tiene ID guardado
            candidatos = base_qs.filter(phone_number__icontains=number).filter(
                Q(wpp_message_id__isnull=True) | Q(wpp_message_id='')
            ).order_by('-sent_at')[:5]
            msg = next((m for m in candidatos if puede_cambiar(m.delivery_status, status)), None)

        updated = 1 if msg and aplicar_estado(msg, status, wpp_id) else 0
        return JsonResponse({"success": True, "updated": updated})

    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
def api_send_result(request):
    """
    Llamado por el gateway cuando un mensaje de la cola fue procesado
    ('sent' o 'failed'). Se busca por el ID que Django le dio al mensaje.
    """
    if not is_internal_request(request):
        return JsonResponse({'error': 'No autorizado'}, status=403)
    if request.method != 'POST':
        return JsonResponse({"success": False}, status=405)
    try:
        data   = json.loads(request.body)
        number = re.sub(r'\D', '', str(data.get('number') or ''))
        status = data.get('status', '')       # 'sent' o 'failed'
        wpp_id = (data.get('wpp_message_id') or '').strip()

        if not status or (not number and not wpp_id):
            return JsonResponse({"success": False, "error": "Faltan parametros"}, status=400)

        base_qs = Message.objects.filter(owner=_internal_owner(data), direction='outbound')

        msg = base_qs.filter(wpp_message_id=wpp_id).first() if wpp_id else None
        if not msg and number:
            # Respaldo para mensajes creados sin ID: el pendiente más reciente a ese número
            msg = base_qs.filter(
                phone_number__icontains=number, delivery_status='pending'
            ).order_by('-sent_at').first()

        if msg:
            aplicar_estado(msg, status, wpp_id)
            if status == 'failed' and data.get('error') and msg.delivery_status == 'failed':
                msg.error_log = str(data['error'])[:500]
                msg.save(update_fields=['error_log'])

        return JsonResponse({"success": True, "updated": 1 if msg else 0})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
def dummy_success(request):
    return JsonResponse({"success": True, "status": "ok"})


@csrf_exempt
def api_cambiar_numero(request):
    """Cierra la sesión de WhatsApp en Node.js."""
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if request.method == 'POST':
        try:
            requests.post(_whatsapp_url('/api/logout'), json={'user_id': user.pk}, headers=internal_headers(), timeout=10)
            return JsonResponse({"success": True})
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})
    return JsonResponse({"success": False, "error": "Método no permitido"})


def api_ws_ticket(request):
    """Entrega un ticket de 60 s para abrir el WebSocket del gateway (solo usuarios autenticados)."""
    user = _get_user(request)
    if not user:
        # 200 (no 401) para no disparar el aviso de "sesión expirada" del
        # frontend mientras el usuario todavía está en la pantalla de login.
        return JsonResponse({'authenticated': False, 'ticket': None})
    return JsonResponse({'authenticated': True, 'ticket': make_ws_ticket(user)})


def api_qr_status(request):
    """Proxy: devuelve el QR y/o código de vinculación desde Node.js."""
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        resp = requests.get(_whatsapp_url('/api/qr'), params={'user_id': user.pk}, headers=internal_headers(), timeout=10)
        data = resp.json()
        return JsonResponse(data)
    except Exception:
        return JsonResponse({"ready": False, "has_qr": False, "qr": None, "has_pairing": False, "pairing_code": None})


@csrf_exempt
def api_request_pairing(request):
    """Solicita un código de vinculación por número de teléfono a Node.js."""
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if request.method == 'POST':
        try:
            data  = json.loads(request.body)
            phone = data.get('phone', '').strip()
            if not phone:
                return JsonResponse({"success": False, "error": "Falta el número de teléfono"})
            resp = requests.post(
                _whatsapp_url('/api/request-pairing'),
                json={"phone": phone, "user_id": user.pk},
                headers=internal_headers(),
                timeout=15
            )
            return JsonResponse(resp.json())
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})
    return JsonResponse({"success": False, "error": "Método no permitido"})


def cambiar_numero_admin_view(request):
    """Página del admin para cambiar el número de WhatsApp con QR en pantalla."""
    context = admin.site.each_context(request)
    context['title'] = 'Cambiar Número de WhatsApp'

    # Estado actual
    try:
        status_resp = requests.get(_whatsapp_url('/api/status'), params={'user_id': request.user.pk}, headers=internal_headers(), timeout=3)
        context['wa_connected'] = status_resp.json().get('ready', False)
    except Exception:
        context['wa_connected'] = False

    provider = ApiProvider.objects.filter(is_active=True).first()
    context['numero_actual'] = provider.display_number if provider else '—'

    return render(request, 'mass_sender/cambiar_numero.html', context)




# ─────────────────────────────────────────────
# IMPORTAR CONTACTOS DESDE CSV
# ─────────────────────────────────────────────
@staff_member_required
def import_contacts(request):
    request.current_app = admin.site.name
    result = None
    admin_context = admin.site.each_context(request)

    if request.method == 'POST':

        # ── Rama A: datos ya procesados desde el modal de preview ──────────
        contacts_json = request.POST.get('contacts_json')
        if contacts_json:
            try:
                contacts_data = json.loads(contacts_json)
            except Exception:
                django_messages.error(request, 'Error al procesar los datos. Intenta de nuevo.')
                return redirect('/admin/import-contacts/')

            creados = actualizados = errores = 0
            detalle = []

            for i, row in enumerate(contacts_data, start=1):
                raw_tel   = str(row.get('telefono',  '')).strip()
                nombre    = str(row.get('nombre',    '')).strip()
                etiquetas = str(row.get('etiquetas', '')).strip()
                notas     = str(row.get('notas',     '')).strip()

                telefono, tel_err = normalizar_telefono(raw_tel)
                if tel_err:
                    errores += 1
                    detalle.append({'fila': i, 'telefono': raw_tel or '—', 'nombre': nombre,
                                    'estado': 'error', 'mensaje': tel_err})
                    continue

                try:
                    defaults = {'full_name': nombre or telefono, 'tags': etiquetas}
                    if notas:
                        defaults['custom_data'] = {'notas': notas}

                    contact, created = Contact.objects.update_or_create(
                        owner=request.user, phone_number=telefono, defaults=defaults)

                    if created:
                        creados += 1; estado = 'creado'; msg = 'Contacto nuevo'
                    else:
                        actualizados += 1; estado = 'actualizado'; msg = 'Datos actualizados'

                    detalle.append({'fila': i, 'telefono': telefono, 'nombre': nombre,
                                    'estado': estado, 'mensaje': msg})
                except Exception as e:
                    errores += 1
                    detalle.append({'fila': i, 'telefono': telefono, 'nombre': nombre,
                                    'estado': 'error', 'mensaje': str(e)[:80]})

            result = {
                'creados': creados, 'actualizados': actualizados,
                'errores': errores,
                'total': creados + actualizados + errores,
                'detalle': detalle,
            }
            return render(request, 'mass_sender/import_contacts.html', {
                **admin_context, 'title': 'Importar Contactos CSV', 'result': result,
            })

        # ── Rama B: subida de archivo CSV clásica (fallback) ───────────────
        csv_file = request.FILES.get('csv_file')
        separator = request.POST.get('separator', ',')
        skip_header = request.POST.get('skip_header') == 'on'

        if not csv_file:
            django_messages.error(request, 'No se seleccionó ningún archivo.')
            return redirect('/admin/import-contacts/')

        if not csv_file.name.lower().endswith(('.csv', '.txt')):
            django_messages.error(request, 'El archivo debe ser .csv o .txt')
            return redirect('/admin/import-contacts/')

        try:
            raw = csv_file.read().decode('utf-8-sig', errors='replace')
        except Exception:
            django_messages.error(request, 'No se pudo leer el archivo. Asegúrate de que esté en UTF-8.')
            return redirect('/admin/import-contacts/')

        reader = csv.reader(io.StringIO(raw), delimiter=separator)
        filas = list(reader)

        if skip_header and filas:
            filas = filas[1:]

        creados = 0
        actualizados = 0
        errores = 0
        detalle = []

        for i, fila in enumerate(filas, start=2 if skip_header else 1):
            if not fila or all(c.strip() == '' for c in fila):
                continue

            raw_tel   = fila[0].strip() if len(fila) > 0 else ''
            nombre    = fila[1].strip() if len(fila) > 1 else ''
            etiquetas = fila[2].strip() if len(fila) > 2 else ''
            notas     = fila[3].strip() if len(fila) > 3 else ''

            telefono, tel_err = normalizar_telefono(raw_tel)
            if tel_err:
                errores += 1
                detalle.append({'fila': i, 'telefono': raw_tel or '—', 'nombre': nombre,
                                'estado': 'error', 'mensaje': tel_err})
                continue

            try:
                defaults = {
                    'full_name': nombre or telefono,
                    'tags': etiquetas,
                }
                if notas:
                    defaults['custom_data'] = {'notas': notas}

                contact, created = Contact.objects.update_or_create(
                    owner=request.user,
                    phone_number=telefono,
                    defaults=defaults,
                )
                if created:
                    creados += 1
                    estado = 'creado'
                    msg = 'Contacto nuevo'
                else:
                    actualizados += 1
                    estado = 'actualizado'
                    msg = 'Datos actualizados'

                detalle.append({'fila': i, 'telefono': telefono, 'nombre': nombre, 'estado': estado, 'mensaje': msg})

            except Exception as e:
                errores += 1
                detalle.append({'fila': i, 'telefono': telefono, 'nombre': nombre, 'estado': 'error', 'mensaje': str(e)[:80]})

        result = {
            'creados': creados,
            'actualizados': actualizados,
            'errores': errores,
            'total': creados + actualizados + errores,
            'detalle': detalle,
        }

    return render(request, 'mass_sender/import_contacts.html', {
        **admin_context,
        'title': 'Importar Contactos CSV',
        'result': result,
    })


# ─────────────────────────────────────────────
# API DE REPORTES (JSON)
# ─────────────────────────────────────────────
class _SinPermiso(Exception):
    pass


def _alcance_reporte(request, user):
    """
    De quién es el reporte. Un usuario normal solo ve el suyo (se ignora
    ?usuario=). El administrador puede pedir ?usuario=<id> o ?usuario=todos.
    Devuelve un User, o None para "todos los usuarios".
    """
    pedido = request.GET.get('usuario', '')
    if not pedido or not user.is_staff:
        return user
    if pedido == 'todos':
        return None
    from django.contrib.auth import get_user_model
    try:
        otro = get_user_model().objects.filter(pk=int(pedido)).first()
    except ValueError:
        otro = None
    if otro is None:
        raise _SinPermiso('Usuario no encontrado')
    return otro


def _sufijo_alcance(alcance, user):
    """Parte del nombre del archivo: vacío para el propio reporte, 'todos_' o 'usuario_'."""
    if alcance is user:
        return ''
    quien = 'todos' if alcance is None else alcance.get_username().split('@')[0]
    return ''.join(ch if ch.isalnum() or ch in '-_' else '_' for ch in quien) + '_'


@csrf_exempt
def api_reportes(request):
    """Estadísticas del periodo para la página de reportes (ver reportes.py)."""
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        alcance = _alcance_reporte(request, user)
    except _SinPermiso as e:
        return JsonResponse({'error': str(e)}, status=404)
    desde, hasta = reportes.rango_fechas(request)
    status_fil = request.GET.get('status', '')
    datos = reportes.datos_reporte(alcance, desde, hasta, status_fil)
    mensajes = reportes.mensajes_detalle(alcance, desde, hasta, status_fil, limite=100)
    for m in mensajes:
        m.pop('fecha_dt', None)
        m['mensaje'] = m['mensaje'][:120]
    datos['mensajes'] = mensajes
    return JsonResponse(datos)


def _descarga(contenido, tipo, nombre):
    """Envía el archivo generado en memoria; no se guarda nada en el servidor."""
    from django.http import HttpResponse
    resp = HttpResponse(contenido, content_type=tipo)
    resp['Content-Disposition'] = f'attachment; filename="{nombre}"'
    resp['Cache-Control'] = 'no-store'
    return resp


def api_reportes_excel(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        alcance = _alcance_reporte(request, user)
    except _SinPermiso as e:
        return JsonResponse({'error': str(e)}, status=404)
    desde, hasta = reportes.rango_fechas(request)
    contenido = reportes.excel_reporte(alcance, desde, hasta, request.GET.get('status', ''))
    return _descarga(contenido,
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     f'reporte_masssend_{_sufijo_alcance(alcance, user)}{desde}_{hasta}.xlsx')


def api_reportes_pdf(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        alcance = _alcance_reporte(request, user)
    except _SinPermiso as e:
        return JsonResponse({'error': str(e)}, status=404)
    desde, hasta = reportes.rango_fechas(request)
    contenido = reportes.pdf_reporte(alcance, desde, hasta, request.GET.get('status', ''))
    return _descarga(contenido, 'application/pdf', f'reporte_masssend_{_sufijo_alcance(alcance, user)}{desde}_{hasta}.pdf')


# ─────────────────────────────────────────────
# VISTA DE REPORTES (página HTML en el admin)
# ─────────────────────────────────────────────
@staff_member_required
def chat_embed_view(request):
    request.current_app = admin.site.name
    return render(request, 'mass_sender/chat_embed.html', {
        **admin.site.each_context(request),
        'title': 'Chat WhatsApp',
    })


@staff_member_required
def reportes_view(request):
    request.current_app = admin.site.name
    return render(request, 'mass_sender/reportes.html', {
        **admin.site.each_context(request),
        'title': 'Reportes de Mensajeria',
    })


# ─────────────────────────────────────────────
# API PROGRESO DE CAMPAÑA (JSON polling)
# ─────────────────────────────────────────────
@csrf_exempt
def api_campaign_progress(request, campaign_id):
    """
    Devuelve el progreso actual de una campaña en formato JSON.
    Útil para hacer polling desde el frontend y mostrar una barra de progreso.
    """
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    from .models import Campaign, CampaignProgress
    try:
        campaign = Campaign.objects.get(id=campaign_id)
        progress = CampaignProgress.objects.get(campaign=campaign)
        return JsonResponse({
            'success': True,
            'campaign_id': campaign_id,
            'campaign_name': campaign.name,
            'status': campaign.status,
            'total': progress.total,
            'sent': progress.sent,
            'failed': progress.failed,
            'is_running': progress.is_running,
            'percent': int((progress.sent + progress.failed) / progress.total * 100) if progress.total > 0 else 0,
            'last_error': progress.last_error,
            'started_at': progress.started_at.isoformat() if progress.started_at else None,
            'finished_at': progress.finished_at.isoformat() if progress.finished_at else None,
        })
    except Campaign.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Campaña no encontrada'}, status=404)
    except CampaignProgress.DoesNotExist:
        return JsonResponse({
            'success': True,
            'campaign_id': campaign_id,
            'status': Campaign.objects.get(id=campaign_id).status,
            'is_running': False,
            'total': 0, 'sent': 0, 'failed': 0, 'percent': 0,
            'last_error': None,
        })


# ─────────────────────────────────────────────
# VISTA: MONITOR EN TIEMPO REAL DE CAMPAÑA
# ─────────────────────────────────────────────
@staff_member_required
def campaign_monitor_view(request, campaign_id):
    """
    Pagina de monitoreo en tiempo real del envio de una campana.
    Usa polling al endpoint api_campaign_progress para mostrar
    barra de progreso, contadores y tiempo estimado.
    """
    from .models import Campaign
    try:
        campaign = Campaign.objects.get(id=campaign_id)
    except Campaign.DoesNotExist:
        from django.http import Http404
        raise Http404("Campana no encontrada")

    return render(request, 'mass_sender/campaign_monitor.html', {
        **admin.site.each_context(request),
        'title': f'Monitor — {campaign.name}',
        'campaign_id': campaign_id,
        'campaign_name': campaign.name,
    })


# ═══════════════════════════════════════════════════════════════════════════
# API REST PARA REACT — sin interfaz Django, solo JSON
# ═══════════════════════════════════════════════════════════════════════════

# ── Autenticación ────────────────────────────────────────────────────────

@csrf_exempt
def api_login(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Método no permitido'}, status=405)
    try:
        data = json.loads(request.body)
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return JsonResponse({
                'success': True,
                'user': {'username': user.username, 'email': user.email}
            })
        return JsonResponse({'success': False, 'error': 'Credenciales incorrectas'}, status=401)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
def api_logout(request):
    logout(request)
    return JsonResponse({'success': True})


def api_me(request):
    # Intentar autenticación por JWT primero
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
    try:
        auth = JWTAuthentication()
        result = auth.authenticate(request)
        if result:
            user, token = result
            return JsonResponse({
                'authenticated': True,
                'user': {
                    'username': user.username,
                    'email': user.email,
                    'nombre': token.get('nombre', user.get_full_name()),
                    'foto': token.get('foto', ''),
                    'isStaff': user.is_staff,
                }
            })
    except (InvalidToken, TokenError):
        pass
    # Fallback: sesión Django normal
    if request.user.is_authenticated:
        return JsonResponse({
            'authenticated': True,
            'user': {
                'username': request.user.username,
                'email': request.user.email,
                'isStaff': request.user.is_staff,
            }
        })
    return JsonResponse({'authenticated': False}, status=401)


# ── Campañas ─────────────────────────────────────────────────────────────

@csrf_exempt
def api_campanas_list(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)

    if request.method == 'GET':
        # Aislamiento por dueño: cada usuario ve solo sus propias campañas,
        # salvo el staff/superusuario, que ve todas (panel administrativo).
        campanas = Campaign.objects.all() if user.is_staff else Campaign.objects.filter(owner=user)
        campanas = campanas.order_by('-created_at')
        data = []
        for c in campanas:
            try:
                p = c.progress
                progreso = {
                    'total': p.total, 'sent': p.sent, 'failed': p.failed,
                    'is_running': p.is_running,
                    'percent': int((p.sent + p.failed) / p.total * 100) if p.total > 0 else 0
                }
            except CampaignProgress.DoesNotExist:
                progreso = {'total': 0, 'sent': 0, 'failed': 0, 'is_running': False, 'percent': 0}

            data.append({
                'id': c.id,
                'nombre': c.name,
                'status': c.status,
                'mensaje': c.message_template[:80] + '...' if len(c.message_template) > 80 else c.message_template,
                'target_tags': c.target_tags or '',
                'scheduled_at': c.scheduled_at.isoformat() if c.scheduled_at else None,
                'created_at': timezone.localtime(c.created_at).strftime('%d/%m/%Y %H:%M'),
                'progreso': progreso,
            })
        return JsonResponse({'campanas': data})

    if request.method == 'POST':
        try:
            # Soporta tanto JSON como multipart/form-data (para subir archivos)
            ct = request.content_type or ''
            if 'multipart' in ct or 'form' in ct:
                data = request.POST
                media_file = request.FILES.get('media_file')
            else:
                data = json.loads(request.body)
                media_file = None
            with transaction.atomic():
                campana = Campaign.objects.create(
                    owner=user,
                    name=data.get('nombre', '').strip(),
                    message_template=data.get('mensaje', '').strip(),
                    target_tags=data.get('target_tags', '').strip() or None,
                    media_url=data.get('media_url', '').strip() or None,
                    status='draft',
                )
                if media_file:
                    # Almacenamiento distribuido: la foto/video se guarda en
                    # PocketBase y la campaña conserva solo la URL pública.
                    # Si PocketBase no responde, respaldo en media/ local.
                    from .pocketbase_media import subir_media_campana
                    pb_url = subir_media_campana(media_file, campaign_id=campana.id, title=campana.name)
                    if pb_url:
                        campana.media_url = pb_url
                    else:
                        campana.media_file = media_file
                    campana.save()
            return JsonResponse({'success': True, 'id': campana.id}, status=201)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'error': 'Método no permitido'}, status=405)


@csrf_exempt
def api_campanas_detail(request, pk):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        campana = Campaign.objects.get(pk=pk)
    except Campaign.DoesNotExist:
        return JsonResponse({'error': 'No encontrada'}, status=404)
    if not _es_dueno_o_staff(user, campana):
        return JsonResponse({'error': 'No autorizado'}, status=403)

    if request.method == 'GET':
        # media_effective: archivo subido tiene prioridad sobre URL manual
        media_effective = ''
        media_file_name = ''
        if campana.media_file:
            try:
                media_effective = request.build_absolute_uri(campana.media_file.url)
                media_file_name = campana.media_file.name.split('/')[-1]
            except Exception:
                pass
        elif campana.media_url:
            from .pocketbase_media import es_url_pocketbase
            if es_url_pocketbase(campana.media_url):
                # Archivo protegido en PocketBase: el navegador debe pasar
                # por el endpoint autenticado del backend (nunca URL directa).
                media_effective = request.build_absolute_uri(
                    f'/whatsapp/api/campanas/{campana.id}/media/'
                )
                media_file_name = campana.media_url.split('/')[-1]
            else:
                media_effective = campana.media_url
        return JsonResponse({
            'id': campana.id,
            'nombre': campana.name,
            'mensaje': campana.message_template,
            'status': campana.status,
            'target_tags': campana.target_tags or '',
            'media_url': campana.media_url or '',
            'media_file_url': media_effective,
            'media_file_name': media_file_name,
            'scheduled_at': campana.scheduled_at.isoformat() if campana.scheduled_at else None,
            'created_at': timezone.localtime(campana.created_at).strftime('%d/%m/%Y %H:%M'),
        })

    if request.method == 'PUT':
        try:
            ct = request.content_type or ''
            if 'multipart' in ct or 'form' in ct:
                # Django no parsea request.POST/FILES en PUT — usar MultiPartParser
                from django.http.multipartparser import MultiPartParser as _MP
                _data, _files = _MP(request.META, request, request.upload_handlers).parse()
                media_file = _files.get('media_file')
            else:
                _data = json.loads(request.body)
                media_file = None

            def _get(key, default):
                v = _data.get(key)
                return v if v is not None else default

            with transaction.atomic():
                campana.name             = _get('nombre',      campana.name)
                campana.message_template = _get('mensaje',     campana.message_template)
                campana.target_tags      = _get('target_tags', campana.target_tags) or None
                campana.media_url        = _get('media_url',   campana.media_url)   or None
                if media_file:
                    from .pocketbase_media import subir_media_campana
                    pb_url = subir_media_campana(media_file, campaign_id=campana.id, title=campana.name)
                    if pb_url:
                        campana.media_url = pb_url
                        campana.media_file = None  # el archivo vive en PocketBase
                    else:
                        campana.media_file = media_file
                campana.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        with transaction.atomic():
            campana.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Método no permitido'}, status=405)


def api_campanas_media(request, pk):
    """
    Entrega el archivo (foto/video) de una campaña almacenado en PocketBase.
    Protección de archivos: la colección es privada, por lo que la URL de
    PocketBase no funciona directamente; SOLO este endpoint, que valida al
    usuario autenticado (sesión o JWT), puede entregar el contenido.
    """
    from django.http import HttpResponse
    from .pocketbase_media import descargar_media, es_url_pocketbase

    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        campana = Campaign.objects.get(pk=pk)
    except Campaign.DoesNotExist:
        return JsonResponse({'error': 'No encontrada'}, status=404)
    if not _es_dueno_o_staff(user, campana):
        return JsonResponse({'error': 'No autorizado'}, status=403)
    if not campana.media_url or not es_url_pocketbase(campana.media_url):
        return JsonResponse({'error': 'La campaña no tiene archivo en PocketBase.'}, status=404)

    contenido, content_type = descargar_media(campana.media_url)
    if contenido is None:
        return JsonResponse({'error': 'No fue posible obtener el archivo desde PocketBase.'}, status=502)
    response = HttpResponse(contenido, content_type=content_type)
    filename = campana.media_url.split('/')[-1]
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response


@csrf_exempt
def api_campanas_ejecutar(request, pk):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        from .admin import _send_campaign_background, get_campaign_lock
        import os

        campana = Campaign.objects.get(pk=pk)
        if not _es_dueno_o_staff(user, campana):
            return JsonResponse({'error': 'No autorizado'}, status=403)

        if campana.status == 'running':
            return JsonResponse({'success': False, 'error': 'La campaña ya está en ejecución'})

        # Se envía a los contactos del dueño de la campaña, desde SU número
        qs = Contact.objects.filter(owner=campana.owner or user, is_opted_out=False).exclude(phone_number__contains='@')
        if campana.target_tags:
            qs = qs.filter(tags__icontains=campana.target_tags.strip())

        contact_ids = list(qs.values_list('id', flat=True))
        if not contact_ids:
            return JsonResponse({'success': False, 'error': 'No hay contactos activos para esta campaña'})

        campaign_lock = get_campaign_lock(campana.id)
        if not campaign_lock.acquire(blocking=False):
            return JsonResponse({'success': False, 'error': 'La campaña ya está siendo ejecutada'})

        # Cobro de créditos: 1 crédito = 1 mensaje. Los admins (staff)
        # no consumen créditos. Si no alcanza el saldo, se libera el
        # lock recién adquirido y se corta antes de lanzar el hilo.
        # Con BILLING_ENABLED=False (despliegue sin pagos) no se cobra.
        if not user.is_staff and getattr(settings, 'BILLING_ENABLED', True):
            from billing.services import wallet_service
            from billing.utils.errors import AppError
            try:
                wallet_service.spend_credits(
                    user, len(contact_ids), reason=f'Campaña "{campana.name}" (#{campana.id})',
                )
            except AppError as e:
                campaign_lock.release()
                return JsonResponse({'success': False, 'error': e.message}, status=402)

        def hilo_target(cid, cids, lock):
            try:
                _send_campaign_background(cid, cids)
            finally:
                lock.release()

        hilo = threading.Thread(
            target=hilo_target,
            args=(campana.id, contact_ids, campaign_lock),
            daemon=True,
            name=f'Campaign-{campana.id}'
        )
        hilo.start()

        return JsonResponse({
            'success': True,
            'message': f'Campaña iniciada para {len(contact_ids)} contactos'
        })
    except Campaign.DoesNotExist:
        return JsonResponse({'error': 'Campaña no encontrada'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ── Contactos ─────────────────────────────────────────────────────────────

@csrf_exempt
def api_contactos_list(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)

    if request.method == 'GET':
        busqueda = request.GET.get('q', '')
        tag = request.GET.get('tag', '')
        estado = request.GET.get('estado', '')
        page = int(request.GET.get('page', 1))
        per_page = 50

        qs = Contact.objects.filter(owner=user).exclude(phone_number__contains='@').order_by('-created_at')
        if busqueda:
            qs = qs.filter(Q(phone_number__icontains=busqueda) | Q(full_name__icontains=busqueda))
        if tag:
            qs = qs.filter(tags__icontains=tag)
        if estado == 'activo':
            qs = qs.filter(is_opted_out=False)
        elif estado == 'optout':
            qs = qs.filter(is_opted_out=True)

        total = qs.count()
        contactos = qs[(page - 1) * per_page: page * per_page]

        # Obtener etiquetas únicas para los filtros
        # distinct(): con cientos de miles de contactos solo se leen las
        # combinaciones de etiquetas distintas, no una fila por contacto
        all_tags_raw = Contact.objects.filter(owner=user).exclude(tags__isnull=True).exclude(tags='') \
            .values_list('tags', flat=True).distinct()
        tags_set = set()
        for t in all_tags_raw:
            for part in t.split(','):
                clean = part.strip()
                if clean:
                    tags_set.add(clean)

        return JsonResponse({
            'contactos': [{
                'id': c.id,
                'telefono': c.phone_number,
                'nombre': c.full_name or '',
                'tags': c.tags or '',
                'is_opted_out': c.is_opted_out,
                'created_at': timezone.localtime(c.created_at).strftime('%d/%m/%Y'),
            } for c in contactos],
            'total': total,
            'page': page,
            'pages': (total + per_page - 1) // per_page,
            'tags_disponibles': sorted(tags_set),
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            telefono = data.get('telefono', '').strip()
            if not telefono:
                return JsonResponse({'success': False, 'error': 'El teléfono es requerido'}, status=400)
            # 0987654321, 987654321 o +593 0987654321 -> 593987654321
            telefono, tel_err = normalizar_telefono(telefono)
            if tel_err:
                return JsonResponse({'success': False, 'error': tel_err}, status=400)
            with transaction.atomic():
                contact, created = Contact.objects.update_or_create(
                    owner=user,
                    phone_number=telefono,
                    defaults={
                        'full_name': data.get('nombre', '').strip() or telefono,
                        'tags': data.get('tags', '').strip() or None,
                    }
                )
            return JsonResponse({'success': True, 'id': contact.id, 'created': created}, status=201)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'error': 'Método no permitido'}, status=405)


@csrf_exempt
def api_contactos_detail(request, pk):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        contacto = Contact.objects.get(pk=pk, owner=user)
    except Contact.DoesNotExist:
        return JsonResponse({'error': 'No encontrado'}, status=404)

    if request.method == 'PUT':
        try:
            data = json.loads(request.body)
            if 'telefono' in data:
                nuevo_tel, tel_err = normalizar_telefono(data.get('telefono', ''))
                if tel_err:
                    return JsonResponse({'success': False, 'error': tel_err}, status=400)
                duplicado = Contact.objects.filter(owner=user, phone_number=nuevo_tel).exclude(pk=contacto.pk).exists()
                if duplicado:
                    return JsonResponse({'success': False, 'error': 'Ya tienes otro contacto con ese número.'}, status=400)
                contacto.phone_number = nuevo_tel
            with transaction.atomic():
                contacto.full_name = data.get('nombre', contacto.full_name)
                contacto.tags = data.get('tags', contacto.tags) or None
                contacto.is_opted_out = data.get('is_opted_out', contacto.is_opted_out)
                contacto.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        with transaction.atomic():
            contacto.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'error': 'Método no permitido'}, status=405)


@csrf_exempt
def api_contactos_bulk_delete(request):
    """Elimina múltiples contactos por lista de IDs."""
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    try:
        data = json.loads(request.body)
        ids = data.get('ids', [])
        if not ids:
            return JsonResponse({'error': 'No se enviaron IDs'}, status=400)
        deleted, _ = Contact.objects.filter(owner=user, id__in=ids).delete()
        return JsonResponse({'success': True, 'eliminados': deleted})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
def api_contactos_importar(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    try:
        data = json.loads(request.body)
        contactos = data.get('contactos', [])
        resultado = default_message_service.__class__
        from .services import ContactService
        resultado = ContactService.importar_lote(contactos, user)
        return JsonResponse({'success': True, **resultado})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def api_usuarios_contactos(request):
    """Solo administradores: usuarios y cuántos contactos tiene cada uno."""
    from .exportar_contactos import usuarios_con_contactos
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if not user.is_staff:
        return JsonResponse({'error': 'Solo el administrador puede ver esto.'}, status=403)
    return JsonResponse({'usuarios': usuarios_con_contactos()})


def api_contactos_exportar(request):
    """
    Solo administradores: descarga en Excel los contactos de un usuario
    (?usuario=<id>) o de todos (?usuario=todos). Se genera en el momento y
    no se guarda en el servidor.
    """
    from .exportar_contactos import excel_contactos
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if not user.is_staff:
        return JsonResponse({'error': 'Solo el administrador puede descargar contactos.'}, status=403)
    usuario = request.GET.get('usuario', '')
    if usuario == 'todos':
        usuario_id = None
    else:
        try:
            usuario_id = int(usuario) if usuario else user.pk
        except ValueError:
            return JsonResponse({'error': 'Usuario inválido'}, status=400)
    contenido, nombre = excel_contactos(usuario_id, request.GET.get('etiqueta', '').strip())
    return _descarga(contenido,
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nombre)


@csrf_exempt
def api_contactos_leer_archivo(request):
    """
    Lee un Excel (.xlsx, .xls, .xlsm, .xlsb), .ods o .csv y devuelve sus
    columnas y filas para la vista previa. El archivo no se guarda.
    """
    from .archivos_contactos import ArchivoInvalido, leer_archivo
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    archivo = request.FILES.get('archivo')
    if not archivo:
        return JsonResponse({'error': 'No se recibió ningún archivo.'}, status=400)
    separador = request.POST.get('separador', '')
    if separador not in ('', ',', ';', '\t', '|'):
        separador = ''
    try:
        encabezados, filas = leer_archivo(archivo, separador)
    except ArchivoInvalido as e:
        return JsonResponse({'error': str(e)}, status=400)
    except Exception:
        return JsonResponse({'error': 'No se pudo leer el archivo. Revisa que no esté dañado.'}, status=400)
    # Se envía por partes (streaming): con 300.000 filas no se arma en
    # memoria un JSON gigante de una sola vez.
    from django.http import StreamingHttpResponse

    def generar(filas=filas):
        yield '{"headers": ' + json.dumps(encabezados, ensure_ascii=False)
        yield ', "total": %d, "rows": [' % len(filas)
        for i in range(0, len(filas), 2000):
            bloque = filas[i:i + 2000]
            yield (',' if i else '') + ','.join(json.dumps(f, ensure_ascii=False) for f in bloque)
            filas[i:i + 2000] = [None] * len(bloque)   # libera memoria a medida que se envía
        yield ']}'

    return StreamingHttpResponse(generar(), content_type='application/json; charset=utf-8')


# ── Mensajes ──────────────────────────────────────────────────────────────

def api_mensajes_list(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)

    page = int(request.GET.get('page', 1))
    per_page = 50
    busqueda = request.GET.get('q', '')
    direccion = request.GET.get('direccion', '')

    qs = Message.objects.filter(owner=user).exclude(phone_number__contains='@').order_by('-sent_at')
    if busqueda:
        qs = qs.filter(Q(phone_number__icontains=busqueda) | Q(content__icontains=busqueda))
    if direccion:
        qs = qs.filter(direction=direccion)

    total = qs.count()
    mensajes = qs[(page - 1) * per_page: page * per_page]

    return JsonResponse({
        'mensajes': [{
            'id': m.id,
            'telefono': m.phone_number,
            'nombre': Contact.objects.filter(owner=user, phone_number=m.phone_number).values_list('full_name', flat=True).first() or m.phone_number,
            'contenido': m.content[:100] if m.content else '',
            'direccion': m.direction,
            'status': m.delivery_status,
            'campana': m.campaign.name if m.campaign else '',
            'fecha': timezone.localtime(m.sent_at).strftime('%d/%m/%Y %H:%M') if m.sent_at else '',
        } for m in mensajes],
        'total': total,
        'page': page,
        'pages': (total + per_page - 1) // per_page,
    })


@csrf_exempt
@require_http_methods(["POST"])
def api_mensajes_bulk_delete(request):
    user = _get_user(request)
    if not user:
        return JsonResponse({'error': 'No autenticado'}, status=401)
    try:
        data = json.loads(request.body)
        ids = data.get('ids', [])
        if not ids:
            return JsonResponse({'error': 'Sin ids'}, status=400)
        eliminados, _ = Message.objects.filter(owner=user, id__in=ids).delete()
        return JsonResponse({'eliminados': eliminados})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
