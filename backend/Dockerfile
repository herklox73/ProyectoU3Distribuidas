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

# Clave temporal SOLO para compilar los archivos estáticos. Se pasa
# únicamente a ese comando (no queda guardada en la imagen) y el
# entrypoint se niega a arrancar si no se define una SECRET_KEY real.
# El superusuario ya no se crea con una contraseña fija: se crea al
# arrancar solo si se definen DJANGO_SUPERUSER_USERNAME/EMAIL/PASSWORD.
ENV DEBUG=False
RUN SECRET_KEY=build-only-collectstatic python manage.py collectstatic --noinput

# Puerto
EXPOSE 8000

# Script de arranque
COPY entrypoint.sh /entrypoint.sh
# Quitar finales de línea de Windows (CRLF) para que Linux pueda ejecutarlo
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
