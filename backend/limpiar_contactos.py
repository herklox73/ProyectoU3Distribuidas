"""
Ejecutar con: python manage.py shell < limpiar_contactos.py
O desde el directorio backend: python limpiar_contactos.py
"""
import django, os, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from mass_sender.models import Contact

# Eliminar contactos con IDs del sistema (no son numeros reales)
malos = Contact.objects.filter(phone_number__contains='@')

print(f"Contactos a eliminar ({malos.count()}):")
for c in malos:
    print(f"  {c.phone_number}")

if malos.count() > 0:
    malos.delete()
    print(f"\nListo. Quedan {Contact.objects.count()} contactos validos.")
else:
    print("No hay contactos basura.")
