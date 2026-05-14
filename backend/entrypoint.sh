#!/bin/bash
set -e

echo "==> Aplicando migraciones..."
python manage.py migrate --noinput

echo "==> Recolectando archivos estáticos..."
python manage.py collectstatic --noinput

echo "==> Iniciando servidor en puerto ${PORT:-8000}..."
exec gunicorn core.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 2 \
    --timeout 120
