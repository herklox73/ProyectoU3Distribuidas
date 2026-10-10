"""
Corrige números de Ecuador guardados con un formato que WhatsApp no entrega:

  5930987654321  (código de país + el 0 local)  ->  593987654321
  0987654321     (formato local)                 ->  593987654321
  987654321      (sin 0 ni código)               ->  593987654321

Si el dueño ya tenía el número correcto guardado, se elimina el duplicado
mal escrito en lugar de crear un conflicto.
"""
import re

from django.db import migrations


def _corregir(numero):
    n = re.sub(r'\D', '', numero or '')
    if re.fullmatch(r'5930\d{9}', n):
        return '593' + n[4:]
    if re.fullmatch(r'09\d{8}', n):
        return '593' + n[1:]
    if re.fullmatch(r'9\d{8}', n):
        return '593' + n
    return None


def corregir_telefonos(apps, schema_editor):
    Contact = apps.get_model('mass_sender', 'Contact')
    for c in Contact.objects.all().only('id', 'owner_id', 'phone_number'):
        nuevo = _corregir(c.phone_number)
        if not nuevo or nuevo == c.phone_number:
            continue
        if Contact.objects.filter(owner_id=c.owner_id, phone_number=nuevo).exclude(pk=c.pk).exists():
            c.delete()
        else:
            Contact.objects.filter(pk=c.pk).update(phone_number=nuevo)


class Migration(migrations.Migration):

    dependencies = [
        ("mass_sender", "0006_contactos_mensajes_por_usuario"),
    ]

    operations = [
        migrations.RunPython(corregir_telefonos, migrations.RunPython.noop),
    ]
