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

# Recopilar archivos estáticos durante el BUILD (con clave dummy)
ENV SECRET_KEY=dummy-collectstatic-key-not-used-in-production
ENV DEBUG=False
RUN python manage.py collectstatic --noinput

# Puerto
EXPOSE 8000

# Script de arranque
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
