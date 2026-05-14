"""Script para limpiar el admin.py y reescribir el MessageAdmin correctamente."""
import re

path = r'mass_sender\admin.py'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Encontrar el bloque de CampaignProgressAdmin (que está bien)
marker = '@admin.register(CampaignProgress)'
idx = content.find(marker)
if idx == -1:
    print("ERROR: No se encontro el marker")
    exit(1)

# Cortar hasta el final de CampaignProgressAdmin
# Buscar el siguiente @admin.register después del CampaignProgress
next_register = content.find('@admin.register(Message)', idx)
if next_register == -1:
    # Tomar hasta el final
    clean_part = content[:idx]
else:
    clean_part = content[:next_register]

# Quitar dobles saltos al final
clean_part = clean_part.rstrip() + '\n\n\n'

# Agregar CampaignProgress si no está ya
if marker not in clean_part:
    clean_part += marker + '\n'

new_message_admin = '''@admin.register(Message)
class MessageAdmin(ModelAdmin):
    list_display = (
        'contacto_display',
        'direccion_display',
        'contenido_preview',
        'estado_display',
        'campaign',
        'sent_at',
    )
    search_fields = ('phone_number', 'content')
    list_filter = ('direction', 'delivery_status', 'campaign')
    readonly_fields = (
        'phone_number', 'direction', 'content', 'delivery_status',
        'campaign', 'sent_at', 'message_type', 'error_log',
    )
    ordering = ('-sent_at',)
    actions = ['eliminar_lid_invalidos']

    def get_queryset(self, request):
        """Excluir mensajes de @lid del listado."""
        return super().get_queryset(request).exclude(phone_number__contains='@')

    def contacto_display(self, obj):
        num = obj.phone_number or ''
        contacto = Contact.objects.filter(phone_number__icontains=num).first()
        nombre = contacto.full_name if contacto and contacto.full_name else None
        bandera = (
            '<img src="https://flagcdn.com/w20/ec.png" '
            'width="14" height="10" '
            'style="border-radius:2px;margin-right:4px;vertical-align:middle;" '
            'alt="EC">'
        )
        if nombre:
            return mark_safe(
                '<div style="line-height:1.4;">'
                f'<div style="font-weight:700;font-size:0.88rem;">{nombre}</div>'
                f'<div style="color:#888;font-size:0.75rem;font-family:monospace;">'
                f'{bandera}+{num}</div>'
                '</div>'
            )
        return mark_safe(
            f'<span style="font-family:monospace;font-size:0.88rem;">'
            f'{bandera}+{num}</span>'
        )
    contacto_display.short_description = 'Contacto'

    def direccion_display(self, obj):
        if obj.direction == 'inbound':
            return mark_safe(
                '<span style="background:#dbeafe;color:#1d4ed8;'
                'padding:3px 10px;border-radius:999px;'
                'font-size:0.75rem;font-weight:700;">Entrante</span>'
            )
        return mark_safe(
            '<span style="background:#dcfce7;color:#15803d;'
            'padding:3px 10px;border-radius:999px;'
            'font-size:0.75rem;font-weight:700;">Saliente</span>'
        )
    direccion_display.short_description = 'Direccion'

    def contenido_preview(self, obj):
        txt = (obj.content or '').strip()
        return (txt[:60] + '...') if len(txt) > 60 else (txt or '-')
    contenido_preview.short_description = 'Mensaje'

    def estado_display(self, obj):
        STATUS = {
            'pending':   ('#f59e0b', '#fef3c7', 'Pendiente'),
            'sent':      ('#6b7280', '#f3f4f6', 'Enviado'),
            'delivered': ('#3b82f6', '#dbeafe', 'Entregado'),
            'read':      ('#0ea5e9', '#e0f9ff', 'Leido'),
            'failed':    ('#ef4444', '#fee2e2', 'Fallido'),
        }
        color, bg, label = STATUS.get(obj.delivery_status, ('#888', '#f3f4f6', obj.delivery_status))
        return mark_safe(
            f'<span style="background:{bg};color:{color};'
            f'padding:3px 10px;border-radius:999px;'
            f'font-size:0.75rem;font-weight:700;">{label}</span>'
        )
    estado_display.short_description = 'Estado de Entrega'

    @admin.action(description='Eliminar mensajes con ID invalido (@lid)')
    def eliminar_lid_invalidos(self, request, queryset):
        total, _ = Message.objects.filter(phone_number__contains='@').delete()
        self.message_user(
            request,
            f'{total} mensajes con ID invalido eliminados.',
            level=messages.SUCCESS
        )
'''

# Reconstruir el archivo: parte limpia + CampaignProgress (que ya está en clean_part) + MessageAdmin nuevo
final = clean_part + new_message_admin

with open(path, 'w', encoding='utf-8') as f:
    f.write(final)

print('admin.py actualizado correctamente.')
print(f'Lineas totales: {len(final.splitlines())}')
