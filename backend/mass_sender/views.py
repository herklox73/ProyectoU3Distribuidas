from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.clickjacking import xframe_options_exempt
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages as django_messages, admin
from django.utils import timezone
from django.db.models import Count, Q
from django.conf import settings
import json
import re
import requests
import csv
import io
from datetime import datetime, timedelta
from .models import Contact, Message, ApiProvider

def _whatsapp_url(path):
    """Devuelve la URL completa del servicio WhatsApp API."""
    base = getattr(settings, 'WHATSAPP_API_URL', 'http://localhost:3001').rstrip('/')
    return f"{base}{path}"


def normalizar_telefono(raw):
    """
    Limpia y normaliza un número al formato E.164 sin el +.

    Reglas Ecuador (caso principal):
      - Móvil local  09XXXXXXXX  (10 dígitos)  → 5939XXXXXXXX  ✓
      - Fijo  02-07XXXXXXX        (8-9 dígitos) → RECHAZADO
      - Ya con código 5939XXXXXXXX (12 dígitos) → ✓
      - Ya con código 5932-5938XX               → RECHAZADO (fijo)

    Números internacionales (no Ecuador):
      - Deben tener mínimo 11 dígitos (código de país + número móvil).
        Ej: Colombia +573XXXXXXXXX (12d), EEUU +1XXXXXXXXXX (11d).
      - Números cortos sin código de país → RECHAZADOS.

    Devuelve (telefono_limpio, error_msg).  error_msg es None si está ok.
    """
    if not raw:
        return '', 'Teléfono vacío'

    raw_str = str(raw).strip()

    # 1. Detectar notación científica (ej: "1.3071E+12")
    if re.search(r'[Ee][+\-]?\d', raw_str):
        return '', 'Número en notación científica — revisa el formato del CSV'

    # 2. Quitar todo excepto dígitos y '+'
    limpio = re.sub(r'[^\d+]', '', raw_str)

    # 3. Quitar el + inicial si existe
    if limpio.startswith('+'):
        limpio = limpio[1:]

    # 4. Caracteres no numéricos que quedaron
    if not limpio.isdigit():
        return '', 'Teléfono contiene caracteres inválidos'

    # 5. Número local Ecuador (empieza con 0, 8-10 dígitos)
    if re.match(r'^0\d{7,9}$', limpio):
        sin_cero = limpio[1:]
        if not sin_cero.startswith('9'):
            return '', (
                f'Número fijo ({limpio[:3]}...) — los fijos no reciben WhatsApp. '
                f'Los móviles ecuatorianos empiezan con 09XXXXXXXX.'
            )
        limpio = '593' + sin_cero  # → 5939XXXXXXXX (12 dígitos)

    # 6. Número con código Ecuador
    if limpio.startswith('593'):
        if not limpio.startswith('5939'):
            return '', (
                f'Número fijo de Ecuador ({limpio[:5]}...) — '
                f'los fijos no reciben WhatsApp. Solo móviles 5939XXXXXXXX.'
            )
        if len(limpio) != 12:
            return '', (
                f'Móvil Ecuador inválido: {len(limpio)} dígitos '
                f'(se esperan exactamente 12: 5939XXXXXXXX).'
            )
        return limpio, None   # ✓ Ecuatoriano válido

    # 7. Número internacional (no Ecuador)
    #    Mínimo 11 dígitos: código de país (1-3 d) + número móvil (8+ d)
    #    Máximo 15 dígitos (límite E.164)
    if len(limpio) < 11:
        return '', (
            f'Número demasiado corto ({len(limpio)} dígitos). '
            f'Para Ecuador usa 09XXXXXXXX. '
            f'Para otros países incluye el código de país (ej: 573... Colombia, 1... EEUU).'
        )
    if len(limpio) > 15:
        return '', f'Número demasiado largo ({len(limpio)} dígitos, máximo 15).'

    return limpio, None

@xframe_options_exempt
def chat_view(request):
    provider = ApiProvider.objects.filter(is_active=True).first()
    return render(request, 'mass_sender/chat.html', {'provider': provider})

def api_leer_mensajes(request):
    provider = ApiProvider.objects.filter(is_active=True).first()
    # Excluir contactos con JIDs invalidos (@lid, @g.us, @newsletter, etc.)
    contacts = Contact.objects.exclude(phone_number__contains='@').order_by('-created_at')
    mensajes_dict = {}

    for contact in contacts:
        num = contact.phone_number
        if num.startswith('+'):
            num = num[1:]

        mensajes_qs = Message.objects.filter(
            phone_number=contact.phone_number
        ).exclude(phone_number__contains='@').order_by('sent_at')

        msgs_list = []
        for m in mensajes_qs:
            msgs_list.append({
                "direccion":      "OUT" if m.direction == "outbound" else "IN",
                # 'tipo' es el campo que usa el JS para detectar si el mensaje es enviado
                "tipo":           "enviado" if m.direction == "outbound" else "recibido",
                "texto":          m.content or "",
                "fecha":          m.sent_at.strftime('%Y-%m-%d') if m.sent_at else "",
                "hora":           m.sent_at.strftime('%H:%M') if m.sent_at else "",
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
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            numero = data.get('to')
            mensaje = data.get('message')
            
            # Buscar contacto
            contact = Contact.objects.filter(phone_number__icontains=numero).first()
            if not contact:
                contact = Contact.objects.create(phone_number=numero, full_name=numero)
                
            # Guardar en DB
            msg_obj = Message.objects.create(
                phone_number=numero,
                content=mensaje,
                direction='outbound'
            )
            
            # Enviar a Node.js y guardar el ID de WhatsApp para los ticks
            try:
                node_resp = requests.post(
                    _whatsapp_url('/api/send'),
                    json={"number": numero, "message": mensaje},
                    timeout=20          # timeout más holgado para validación del número
                ).json()
                wpp_id = node_resp.get('wpp_message_id') or ''
                # Siempre guardar: con o sin wpp_message_id
                msg_obj.delivery_status = 'sent'
                if wpp_id:
                    msg_obj.wpp_message_id = wpp_id
                msg_obj.save()
            except Exception as e:
                print("Error de Node API:", e)
                # Marcar como sent de todas formas para que aparezca el tick
                msg_obj.delivery_status = 'sent'
                msg_obj.save()

            return JsonResponse({"success": True, "texto_enviado": mensaje})
        except Exception as e:
            return JsonResponse({"success": False, "error": {"message": str(e)}})
    return JsonResponse({"success": False})

@csrf_exempt
def api_webhook(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            numero = data.get('from')
            mensaje = data.get('body')

            # Ignorar JIDs internos de WhatsApp (@lid, @g.us, @newsletter, etc.)
            if not numero or '@' in str(numero):
                return JsonResponse({"success": True, "skipped": True})

            if numero and mensaje:
                contact = Contact.objects.filter(phone_number__icontains=numero).first()
                if not contact:
                    contact = Contact.objects.create(phone_number=numero, full_name=numero)

                Message.objects.create(
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
    Llamado por Node.js cuando cambia el estado de entrega de un mensaje.
    ack: -1=fallido, 0=pendiente, 1=enviado, 2=entregado, 3=leido
    Intenta actualizar por wpp_message_id primero; si no encuentra,
    usa el mensaje saliente mas reciente de ese numero como fallback.
    """
    if request.method != 'POST':
        return JsonResponse({"success": False}, status=405)

    try:
        data   = json.loads(request.body)
        wpp_id = data.get('wpp_message_id', '').strip()
        number = data.get('number', '').strip()
        status = data.get('status', '')

        ACK_MAP = {
            '-1': 'failed',
            '0':  'pending',
            '1':  'sent',
            '2':  'delivered',
            '3':  'read',
        }
        ack_num = str(data.get('ack', ''))
        if ack_num in ACK_MAP:
            status = ACK_MAP[ack_num]

        if not status:
            return JsonResponse({"success": False, "error": "Sin status/ack"}, status=400)

        PRIORITY = {'failed': 0, 'pending': 0, 'sent': 1, 'delivered': 2, 'read': 3}

        updated = 0

        # 1. Intentar actualizar por wpp_message_id
        if wpp_id:
            updated = Message.objects.filter(wpp_message_id=wpp_id).update(delivery_status=status)

        # 2. Fallback: buscar el mensaje saliente más reciente que aún no haya alcanzado ese estado
        if updated == 0 and number:
            new_p = PRIORITY.get(status, 0)

            # Preferir mensajes cuyo estado actual sea menor al nuevo (para no retroceder)
            estados_inferiores = [s for s, p in PRIORITY.items() if p < new_p]

            msg = Message.objects.filter(
                phone_number__icontains=number,
                direction='outbound',
                delivery_status__in=estados_inferiores if estados_inferiores else ['sent', 'pending']
            ).order_by('-sent_at').first()

            # Si no encontró con filtro de estado, intentar sin filtro (para el caso de 'failed')
            if not msg and status == 'failed':
                msg = Message.objects.filter(
                    phone_number__icontains=number,
                    direction='outbound'
                ).order_by('-sent_at').first()

            if msg:
                msg.delivery_status = status
                if wpp_id and not msg.wpp_message_id:
                    msg.wpp_message_id = wpp_id
                msg.save()
                updated = 1

        return JsonResponse({"success": True, "updated": updated})

    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
def api_send_result(request):
    """
    Llamado por Node.js cuando un mensaje de la cola fue procesado (enviado o fallido).
    Actualiza el estado real del mensaje en Django.
    """
    if request.method != 'POST':
        return JsonResponse({"success": False}, status=405)
    try:
        data   = json.loads(request.body)
        number = data.get('number', '').strip()
        status = data.get('status', '')       # 'sent' o 'failed'
        wpp_id = data.get('wpp_message_id', '') or ''

        if not number or not status:
            return JsonResponse({"success": False, "error": "Faltan parametros"}, status=400)

        # Buscar el mensaje outbound más reciente en estado 'pending' para ese número
        msg = Message.objects.filter(
            phone_number__icontains=number,
            direction='outbound',
            delivery_status='pending'
        ).order_by('-sent_at').first()

        if msg:
            msg.delivery_status = status
            if wpp_id and not msg.wpp_message_id:
                msg.wpp_message_id = wpp_id
            msg.save()

        return JsonResponse({"success": True, "updated": 1 if msg else 0})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@csrf_exempt
def dummy_success(request):
    return JsonResponse({"success": True, "status": "ok"})


@csrf_exempt
def api_cambiar_numero(request):
    """Cierra la sesión de WhatsApp en Node.js."""
    if request.method == 'POST':
        try:
            requests.post(_whatsapp_url('/api/logout'), timeout=10)
            return JsonResponse({"success": True})
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)})
    return JsonResponse({"success": False, "error": "Método no permitido"})


def api_qr_status(request):
    """Proxy: devuelve el QR y/o código de vinculación desde Node.js."""
    try:
        resp = requests.get(_whatsapp_url('/api/qr'), timeout=5)
        data = resp.json()
        return JsonResponse(data)
    except Exception:
        return JsonResponse({"ready": False, "has_qr": False, "qr": None, "has_pairing": False, "pairing_code": None})


@csrf_exempt
def api_request_pairing(request):
    """Solicita un código de vinculación por número de teléfono a Node.js."""
    if request.method == 'POST':
        try:
            data  = json.loads(request.body)
            phone = data.get('phone', '').strip()
            if not phone:
                return JsonResponse({"success": False, "error": "Falta el número de teléfono"})
            resp = requests.post(
                _whatsapp_url('/api/request-pairing'),
                json={"phone": phone},
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
        status_resp = requests.get(_whatsapp_url('/api/status'), timeout=3)
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
                        phone_number=telefono, defaults=defaults)

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
@staff_member_required
def api_reportes(request):
    desde_str  = request.GET.get('desde', '')
    hasta_str  = request.GET.get('hasta', '')
    status_fil = request.GET.get('status', '')

    hoy = timezone.now().date()
    try:
        desde = datetime.strptime(desde_str, '%Y-%m-%d').date() if desde_str else hoy - timedelta(days=30)
        hasta = datetime.strptime(hasta_str, '%Y-%m-%d').date() if hasta_str else hoy
    except ValueError:
        desde = hoy - timedelta(days=30)
        hasta = hoy

    qs = Message.objects.filter(
        sent_at__date__gte=desde,
        sent_at__date__lte=hasta,
    )

    if status_fil:
        qs = qs.filter(delivery_status=status_fil)

    outbound = qs.filter(direction='outbound')
    inbound  = qs.filter(direction='inbound')

    enviados   = outbound.count()
    recibidos  = inbound.count()
    entregados = outbound.filter(delivery_status='delivered').count()
    leidos     = outbound.filter(delivery_status='read').count()
    fallidos   = outbound.filter(delivery_status='failed').count()
    enviados_puro = outbound.filter(delivery_status='sent').count()

    resumen = {
        'enviados': enviados,
        'recibidos': recibidos,
        'entregados': entregados,
        'leidos': leidos,
        'fallidos': fallidos,
        'enviados_puro': enviados_puro,
    }

    # Por día
    from django.db.models.functions import TruncDate
    por_dia_qs = (
        qs.annotate(dia=TruncDate('sent_at'))
        .values('dia')
        .annotate(
            enviados=Count('id', filter=Q(direction='outbound')),
            recibidos=Count('id', filter=Q(direction='inbound')),
        )
        .order_by('dia')
    )
    por_dia = [
        {
            'dia': str(row['dia']),
            'enviados': row['enviados'],
            'recibidos': row['recibidos'],
        }
        for row in por_dia_qs if row['dia']
    ]

    # Últimos 100 mensajes salientes
    ultimos = outbound.order_by('-sent_at')[:100]
    mensajes = []
    for m in ultimos:
        # Buscar nombre de contacto
        contact = Contact.objects.filter(phone_number=m.phone_number).first()
        campana = m.campaign.name if m.campaign else ''
        mensajes.append({
            'id': m.id,
            'telefono': m.phone_number,
            'nombre': contact.full_name if contact else m.phone_number,
            'campana': campana,
            'mensaje': m.content[:120] if m.content else '',
            'status': m.delivery_status or 'sent',
            'fecha': m.sent_at.strftime('%d/%m/%Y %H:%M') if m.sent_at else '',
        })

    return JsonResponse({
        'resumen': resumen,
        'por_dia': por_dia,
        'mensajes': mensajes,
    })


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
@staff_member_required
def api_campaign_progress(request, campaign_id):
    """
    Devuelve el progreso actual de una campaña en formato JSON.
    Útil para hacer polling desde el frontend y mostrar una barra de progreso.
    """
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
