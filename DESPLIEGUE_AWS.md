# Despliegue liviano de MassSend en AWS (sin asistente de IA)

Versión pensada para la capa gratuita de AWS: una sola máquina **EC2 t3.micro (1 GB de RAM)**.
Se quita Ollama (asistente de IA) porque necesita varios GB de memoria. Todo lo demás
funciona igual: campañas, contactos, chat, reportes, WhatsApp, correos y archivos.

Consumo aproximado: ~600 MB de RAM entre todos los servicios.

---

## 1. Crear la máquina (consola de AWS)

1. Arriba a la derecha elige la región **us-east-1 (N. Virginia)**.
2. Busca **EC2** → **Launch instance**.
3. Configura:
   - **Name:** `masssend`
   - **Imagen (AMI):** Ubuntu Server 24.04 LTS (64-bit **x86**)
   - **Instance type:** `t3.micro` (o `t2.micro`), la que diga *Free tier eligible*.
     ⚠️ No elijas `t4g`: es ARM y PocketBase no arrancaría.
   - **Key pair:** *Create new key pair* → nombre `masssend` → formato `.pem` → se descarga. **Guárdalo bien.**
   - **Network settings → Edit → Security group**, permite estos puertos (Source: `0.0.0.0/0`):
     | Puerto | Para qué |
     |---|---|
     | 22 | SSH (conectarte). Mejor aún: en Source elige **My IP** |
     | 80 | La aplicación web |
     | 8090 | Fotos y videos de campañas (PocketBase) |

     ⚠️ **No abras el puerto 3001.** El gateway de WhatsApp queda solo dentro del servidor;
     el chat en tiempo real entra por el puerto 80 (`/ws/`).
   - **Storage:** 20 GB gp3 (la capa gratuita permite hasta 30 GB).
4. **Launch instance**. Copia la **Public IPv4 address** de la instancia.

> Opcional pero recomendado: **Elastic IP** → *Allocate* → *Associate* a la instancia,
> para que la IP no cambie si reinicias la máquina.

## 2. Conectarte a la máquina (desde Windows)

En PowerShell, en la carpeta donde está `masssend.pem`:

```powershell
ssh -i .\masssend.pem ubuntu@TU_IP_PUBLICA
```

(Si Windows reclama permisos del .pem, también puedes usar el botón **Connect → EC2 Instance Connect** de la consola, que abre una terminal en el navegador.)

## 3. Preparar el servidor (copiar y pegar, una sola vez)

```bash
# Memoria extra en disco (swap de 2 GB): evita que la compilación se quede sin RAM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Vuelve a conectarte con el mismo comando `ssh` del paso 2.

## 4. Descargar el proyecto

```bash
git clone https://github.com/herklox73/ProyectoU3Distribuidas.git masssend
cd masssend
mkdir -p backend/media backend/whatsapp_api/auth_info_baileys
```

## 5. Crear el archivo de configuración `backend/.env`

```bash
nano backend/.env
```

Pega esto y cambia los valores marcados (guardar: `Ctrl+O`, `Enter`, salir: `Ctrl+X`):

```
SECRET_KEY=PON-AQUI-UNA-CLAVE-LARGA-Y-ALEATORIA
ALLOWED_HOSTS=*

EMAIL_USER=tu-correo@gmail.com
EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

POCKETBASE_COLLECTION=campaign_media
POCKETBASE_ADMIN_EMAIL=admin@masssend.local
POCKETBASE_ADMIN_PASSWORD=LA-MISMA-CLAVE-DE-PB_SUPERUSER_PASSWORD

FREE_SIGNUP_CREDITS=10
```

⚠️ **No pongas `DATABASE_URL`**: si existe, Django intenta conectarse a PostgreSQL.
La base de datos será SQLite, guardada en un volumen de Docker.

Para generar la `SECRET_KEY`: `openssl rand -base64 48`
(Si la dejas vacía o con el texto de ejemplo, el backend se niega a arrancar a propósito.)

## 5b. Crear el archivo `.env` de la carpeta principal (claves de los servicios)

Este es otro `.env`, en la carpeta `masssend` (no dentro de `backend`):

```bash
echo "INTERNAL_API_TOKEN=$(openssl rand -hex 32)" > .env
echo "PB_SUPERUSER_PASSWORD=PON-AQUI-UNA-CLAVE-PARA-POCKETBASE" >> .env
nano .env   # cambia la clave de PocketBase y guarda
```

- `INTERNAL_API_TOKEN` es la clave secreta con la que Django y el gateway de WhatsApp
  se reconocen entre sí. Se genera sola; no hace falta copiarla a ningún otro lado.
- `PB_SUPERUSER_PASSWORD` debe ser **la misma** que pusiste en `POCKETBASE_ADMIN_PASSWORD`
  de `backend/.env`.

## 6. Levantar el sistema

```bash
export PUBLIC_IP=$(curl -s https://checkip.amazonaws.com)
docker compose -f compose.aws.yaml up -d --build
```

La primera vez tarda **10 a 20 minutos** (compila el frontend y descarga imágenes).

Crear el usuario administrador:

```bash
docker compose -f compose.aws.yaml exec backend python manage.py createsuperuser
```

## 7. Probar

- Abre en el navegador: `http://TU_IP_PUBLICA`
- Inicia sesión con el administrador del paso 6.
- Ve a **Conectar WhatsApp** y escanea el QR desde *Dispositivos vinculados*.

Para ver el QR o errores en la terminal:

```bash
docker compose -f compose.aws.yaml logs -f whatsapp
```

## Comandos útiles

| Acción | Comando |
|---|---|
| Ver estado | `docker compose -f compose.aws.yaml ps` |
| Ver memoria usada | `docker stats --no-stream` |
| Reiniciar todo | `docker compose -f compose.aws.yaml restart` |
| Apagar | `docker compose -f compose.aws.yaml down` |
| Actualizar el código | `git pull`, luego el `export PUBLIC_IP=...` y el `up -d --build` del paso 6 |

> Si reinicias la máquina sin Elastic IP, la IP cambia: vuelve a hacer el paso 6
> (el `export PUBLIC_IP=...` y el `up -d --build`).

## Seguridad incluida en esta versión

- El gateway de WhatsApp no está expuesto a internet y exige la clave interna en todas sus rutas.
- El chat en tiempo real (WebSocket) solo acepta usuarios con sesión iniciada (ticket de 60 s firmado por Django).
- Las rutas de chat, envío, QR y cambio de número exigen iniciar sesión.
- Los avisos del gateway a Django (mensajes recibidos, confirmaciones) se rechazan si no traen la clave interna.
- El MFA solo se puede configurar sobre la propia cuenta, y el envío de correos exige sesión.
- No hay contraseñas fijas en las imágenes de Docker.

## Un número de WhatsApp por usuario

- Cada usuario entra con su cuenta, va a **Conectar WhatsApp** y escanea el QR con **su** celular.
- Cada usuario ve solo **sus** contactos, **su** chat, **sus** mensajes y reportes, y sus campañas
  salen desde **su** número.
- En una t3.micro caben unos **5 números conectados a la vez** (`MAX_WA_SESSIONS` en
  `compose.aws.yaml`). Si se llena, la página de conexión muestra "Servidor lleno".
  Para más usuarios: una máquina más grande (t3.small = 2 GB ≈ 12 números) y subir ese valor.
- Los contactos y mensajes que existían antes de esta versión quedan a nombre del primer
  administrador, igual que el número que ya estaba vinculado.

## Limitaciones de esta versión

- **Sin Asistente IA:** la página no aparece en el menú.
- **Inicio de sesión con Google:** no funciona con una IP; Google exige un dominio.
  Se entra con usuario y contraseña.
- **HTTP sin candado (sin HTTPS):** para HTTPS hace falta un dominio. Si el sistema se usará
  con datos reales de otras personas, conviene conseguir uno y activar HTTPS.

## Evitar cobros

- En AWS: **Billing → Budgets → Create budget** → plantilla *Zero spend budget* o un tope de 5 USD.
- Las cuentas nuevas de AWS reciben créditos gratuitos por tiempo limitado. Revisa en **Billing → Free tier / Credits** cuánto te queda y hasta qué fecha: cuando se acaben, la máquina empieza a cobrarse.
- Si ya no la usas: **EC2 → Instances → Terminate** y libera la Elastic IP (una IP sin usar sí se cobra).
