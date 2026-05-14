"""
Script para limpiar datos basura generados por whatsapp-web.js:
  - Contactos con '@' en el número (JIDs de grupos y dispositivos)
  - Mensajes con '@' en el número
  - Campaña de ejemplo "Ejemplo xd"

Ejecutar desde la carpeta backend/:
    python limpiar_datos.py
"""

import os
import sys
import django

# Asegurarse de estar en el directorio correcto
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from mass_sender.models import Contact, Message, Campaign

# 1. Mensajes con JIDs (@lid, @g.us, etc.)
mensajes_malos = Message.objects.filter(phone_number__contains='@')
total_mensajes = mensajes_malos.count()
mensajes_malos.delete()
print(f"Mensajes eliminados: {total_mensajes}")

# 2. Contactos con JIDs
contactos_malos = Contact.objects.filter(phone_number__contains='@')
total_contactos = contactos_malos.count()
contactos_malos.delete()
print(f"Contactos eliminados: {total_contactos}")

# 3. Campañas de ejemplo
campanas_malas = Campaign.objects.filter(name__icontains='ejemplo')
total_campanas = campanas_malas.count()
campanas_malas.delete()
print(f"Campañas eliminadas: {total_campanas}")

print("Limpieza completada.")
