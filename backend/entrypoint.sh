#!/bin/bash

echo "==> Aplicando migraciones..."
python manage.py migrate --noinput

echo "==> Iniciando gunicorn en puerto 8000..."
exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --timeout 120 \
    --log-level debug \
    --access-logfile -
