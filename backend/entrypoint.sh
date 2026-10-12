#!/bin/bash

# En producción (DEBUG distinto de True) no se arranca con una clave secreta
# vacía o de ejemplo: con ella cualquiera podría falsificar sesiones y JWT.
if [ "${DEBUG:-False}" != "True" ]; then
  case "${SECRET_KEY:-}" in
    ""|build-only-collectstatic|dummy-*|cambia-esto*|django-insecure-*)
      echo "ERROR: define una SECRET_KEY propia en backend/.env (ej.: openssl rand -base64 48)" >&2
      exit 1;;
  esac
fi

echo "==> Aplicando migraciones..."
python manage.py migrate --noinput

if [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
    echo "==> Creando superusuario (si no existe)..."
    python manage.py createsuperuser --noinput || true
fi

echo "==> Iniciando gunicorn en puerto 8000..."
exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers ${GUNICORN_WORKERS:-1} \
    --timeout ${GUNICORN_TIMEOUT:-300} \
    --log-level info \
    --access-logfile - \
    --error-logfile -
