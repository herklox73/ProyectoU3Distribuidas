#!/bin/bash

echo "==> Aplicando migraciones..."
python manage.py migrate --noinput

echo "==> Iniciando servidor gunicorn en puerto ${PORT:-8000}..."
exec gunicorn core.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 2 \
    --timeout 120 \
    --log-level info \
    --access-logfile -
