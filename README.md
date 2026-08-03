# MassSend — Sistema de Mensajería Masiva por WhatsApp

Aplicación distribuida para envío masivo y personalizado de mensajes de WhatsApp con gestión de contactos, campañas, chat en tiempo real y reportes.

Desarrollado como proyecto de la asignatura **Aplicaciones Distribuidas**.

**Universidad de las Fuerzas Armadas ESPE** — Sede Santo Domingo de los Tsáchilas  
**Docente:** Ing. Geovanny José Brito Casanova  
**NRC:** 29546  
**Estudiante:** Carlos Calapucha

---

## Arquitectura

El sistema está compuesto por tres procesos independientes:

- **Frontend React** (puerto 5173): interfaz de usuario SPA con estado global de conexión
- **Backend Django** (puerto 8000): API REST, lógica de negocio, ORM transaccional, hilos para envío masivo
- **Gateway Node.js + Baileys** (puerto 3001): gateway de WhatsApp con WebSocket para eventos en tiempo real

```
[React Frontend]  <-->  [Django REST API]  <-->  [Node.js + Baileys]
   puerto 5173            puerto 8000              puerto 3001
                                |                        |
                           [SQLite DB]           [WhatsApp Web]
```

---

## Tecnologías utilizadas

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, Vite, Axios |
| Backend | Django 4, Django REST Framework, SimpleJWT |
| Gateway WhatsApp | Node.js, Baileys, Socket.IO |
| Base de datos | SQLite (desarrollo) |
| Autenticación | JWT + Google OAuth 2.0 |
| Tareas asíncronas | Celery + Redis |
| Logs | Python logging → masssend.log |

---

## Requisitos previos

- Python 3.10 o superior
- Node.js 20 o superior
- npm 9 o superior
- Git

---

## Instrucciones de ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/herklox73/ProyectoU3Distribuidas.git
cd ProyectoU3Distribuidas
```

### 2. Configurar el backend Django

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# En Windows:
venv\Scripts\activate
# En Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Crear la base de datos
python manage.py migrate

# Crear usuario administrador
python manage.py createsuperuser

# Iniciar el servidor Django
python manage.py runserver 8000
```

### 3. Configurar el gateway Node.js (WhatsApp)

Abrir una nueva terminal:

```bash
cd backend/whatsapp_api

# Instalar dependencias
npm install

# Iniciar el servidor
node index.js
```

Al iniciar por primera vez se generará un código QR en la consola. Escanéalo con WhatsApp desde tu celular en **Dispositivos vinculados** para conectar el número.

### 4. Configurar e iniciar el frontend React

Abrir una nueva terminal:

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar el servidor de desarrollo
npm run dev
```

### 5. Abrir la aplicación

Navegar a: **http://localhost:5173**

Iniciar sesión con las credenciales del superusuario creado en el paso 2, o usar el botón **Iniciar sesión con Google**.

---

## Estructura del proyecto

```
ProyectoU3Distribuidas/
├── backend/
│   ├── core/                    # Configuración Django (settings, urls, wsgi, asgi)
│   ├── mass_sender/             # App principal
│   │   ├── models.py            # Contact, Message, Campaign, CampaignProgress
│   │   ├── views.py             # API REST + consistencia transaccional
│   │   ├── services.py          # MessageService, ContactService (principios SOLID)
│   │   ├── ai_service.py        # Cliente RPC hacia Ollama (llamada síncrona)
│   │   ├── ai_views.py          # Endpoint del Asistente IA
│   │   ├── pocketbase_media.py  # Subida/entrega de archivos protegidos
│   │   └── migrations/
│   ├── billing/                 # Créditos, pagos en sandbox
│   ├── email_auth/              # Verificación de cuenta, recuperación de contraseña, MFA (TOTP)
│   ├── whatsapp_api/            # Gateway Node.js + Baileys
│   │   ├── index.js             # WebSocket + REST hacia WhatsApp + cola de envíos
│   │   └── Dockerfile
│   ├── Dockerfile
│   ├── masssend.log             # Archivo de logs del sistema
│   └── manage.py
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── App.jsx              # SPA layout + navegación
│       ├── context/
│       │   ├── AuthContext.jsx  # Contexto de autenticación JWT/Google
│       │   └── WaContext.jsx    # Estado global WhatsApp
│       ├── hooks/
│       │   └── useWebSocket.js  # Singleton WebSocket
│       └── pages/               # Chat, Campañas, Contactos, Asistente IA, Créditos,
│                                 # Cola de correos, Verificación/MFA, Reportes
├── infra/
│   └── pocketbase/              # Dockerfile del servicio de almacenamiento protegido
├── compose.yaml                 # Despliegue de desarrollo (Docker Compose)
├── stack.yml                    # Despliegue en clúster (Docker Swarm, réplicas)
├── requirements.txt
└── README.md
```

---

## Conceptos implementados

- **Consistencia transaccional:** `@transaction.atomic` en Django para operaciones críticas
- **Concurrencia:** `threading.Thread` con `threading.Lock` por campaña para evitar envíos duplicados
- **WebSocket:** singleton persistente en React + Node.js broadcast para eventos en tiempo real
- **SOLID:** `MessageService` y `ContactService` con responsabilidad única; vistas que delegan en servicios
- **Autenticación:** JWT (SimpleJWT) + OAuth 2.0 con Google
- **Logging:** registro estructurado de eventos en `backend/masssend.log`
- **Teorema CAP:** el sistema prioriza Consistencia y Tolerancia a Particiones (sistema CP)

---

## Endpoints principales

| Método | URL | Descripción |
|--------|-----|-------------|
| POST | `/api/token/` | Obtener token JWT |
| POST | `/api/token/refresh/` | Refrescar token JWT |
| GET | `/api/contacts/` | Listar contactos |
| POST | `/api/contacts/` | Crear contacto |
| POST | `/api/contacts/import/` | Importar contactos desde CSV |
| POST | `/api/contacts/bulk-delete/` | Eliminar contactos en lote |
| GET | `/api/campaigns/` | Listar campañas |
| POST | `/api/campaigns/` | Crear campaña |
| POST | `/api/campaigns/{id}/ejecutar/` | Ejecutar envío masivo |
| GET | `/api/reports/` | Estadísticas de mensajes enviados |
| GET | `/api/qr-status/` | Estado de conexión WhatsApp |

---

## Variables de entorno

Crea el archivo `backend/.env` para configurar variables de entorno:

```
SECRET_KEY=tu_clave_secreta_django
GOOGLE_CLIENT_ID=tu_client_id
GOOGLE_CLIENT_SECRET=tu_client_secret
```

Sin este archivo Django usará valores por defecto adecuados para desarrollo local.

---

## Logs

El sistema registra eventos en `backend/masssend.log`. Para visualizarlos:

```bash
# Windows
type backend\masssend.log

# Linux/Mac
tail -f backend/masssend.log
```

---

## Tercer parcial — Docker, Swarm, IA local y PocketBase

### Ejecución con Docker Compose (desarrollo)

```powershell
docker compose up --build -d
docker exec -it masssend-ollama ollama pull qwen2.5:0.5b   # solo la primera vez
```

Servicios: frontend (http://localhost:5173), backend Django (8000), WhatsApp/Baileys (3001), Ollama (11434) y PocketBase (8090). La base de datos `backend/db.sqlite3`, la carpeta `backend/media/` y la sesión de WhatsApp se montan desde el disco.

### Ejecución con Docker Swarm (clúster con réplicas y balanceo)

```powershell
docker compose build                       # construir las imágenes
docker swarm init                          # solo la primera vez
docker stack deploy --resolve-image never -c stack.yml masssend
docker exec -it $(docker ps -q -f name=masssend_ollama) ollama pull qwen2.5:0.5b
```

> Nota: no uses `docker compose config | docker stack deploy -c - masssend`. Al re-serializar el
> archivo, `docker compose config` convierte los puertos publicados en texto entre comillas y
> Swarm los rechaza (`services.frontend.ports.0.published must be a integer`). Despliega siempre
> directo desde `stack.yml`, como en el comando de arriba.

Evidencias del clúster:

```powershell
docker stack services masssend       # servicios y réplicas (frontend 3/3)
docker service ps masssend_frontend  # las 3 réplicas activas
docker service logs -f masssend_frontend   # el balanceo: las peticiones llegan a réplicas distintas
```

La malla de enrutamiento (ingress) de Swarm reparte cada solicitud del puerto 5173 entre las 3 réplicas de Nginx; el backend es una sola instancia dueña de la única base de datos (volumen `masssend_db`), lo que garantiza la consistencia.

Para apagar: `docker stack rm masssend` (o `docker compose down` en modo Compose).

### Reproducción de las pruebas del artículo científico

El detalle de las 15 pruebas funcionales evaluadas en el artículo (procedimiento exacto,
comandos y métrica asociada a cada una) está documentado en
[`REPRODUCIR_PRUEBAS.md`](./REPRODUCIR_PRUEBAS.md).

### Novedades del tercer parcial

- **Asistente IA local (Ollama, `qwen2.5:0.5b`)**: página "Asistente IA" — guía de uso del sistema y redacción de mensajes de campaña. Comunicación síncrona (RPC sobre HTTP) con timeout y medición de latencia.
- **Almacenamiento protegido en PocketBase**: las fotos/videos de campañas se guardan en la colección privada `campaign_media` (archivo `protected`). La URL directa es rechazada; el archivo solo se entrega por `GET /whatsapp/api/campanas/<id>/media/` con usuario autenticado (sesión o JWT). Respaldo automático en disco local si PocketBase no está disponible.
- **Colas asíncronas independientes**: una cola de correos (`EmailTask` + worker en segundo plano, visible en la página "Cola de correos") y una cola de envíos de WhatsApp (`sendQueue` en el gateway Node.js, con callback a `/api/send-result/`). El productor responde de inmediato; el consumidor procesa en segundo plano.
- **Verificación de cuenta y recuperación de contraseña**: registro con verificación por correo (`VerifyAccountPage`), flujo de "olvidé mi contraseña" (`ForgotPasswordPage` / `ResetPasswordPage`) y ajustes de seguridad (`SecuritySettingsPage`).
- **Autenticación en dos pasos (TOTP)**: segundo factor de autenticación por app autenticadora (`MfaLoginPage`), conforme a RFC 6238.
- **Créditos y pagos**: gestión de créditos de la cuenta y flujo de pago en entorno sandbox (`CreditosPage`, `PaymentReturnPage`), con acreditación consistente ante escrituras concurrentes.
- **Notificaciones**: panel de notificaciones del usuario (`NotificacionesPage`).
