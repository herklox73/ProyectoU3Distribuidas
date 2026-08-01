FROM python:3.11-slim

# Dependencias del sistema (para psycopg2)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY . .

# Variables dummy para el BUILD (Railway inyecta las reales en runtime)
ENV SECRET_KEY=dummy-collectstatic-key-not-used-in-production
ENV DEBUG=False
ENV DJANGO_SUPERUSER_USERNAME=admin
ENV DJANGO_SUPERUSER_PASSWORD=Admin1234!
ENV DJANGO_SUPERUSER_EMAIL=admin@example.com

# Ejecutar en build: static files + migraciones + superusuario inicial
RUN python manage.py collectstatic --noinput
RUN python manage.py migrate --noinput
RUN python manage.py createsuperuser --noinput || true

# Puerto
EXPOSE 8000

# Script de arranque
COPY entrypoint.sh /entrypoint.sh
# Quitar finales de línea de Windows (CRLF) para que Linux pueda ejecutarlo
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
