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
git clone https://github.com/herklox73/proyectoU2Distribuidas.git
cd proyectoU2Distribuidas
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
proyectoU2Distribuidas/
├── backend/
│   ├── core/                    # Configuración Django (settings, urls, wsgi)
│   ├── mass_sender/             # App principal
│   │   ├── models.py            # Contact, Message, Campaign, CampaignProgress
│   │   ├── views.py             # API REST + consistencia transaccional
│   │   ├── services.py          # MessageService, ContactService (principios SOLID)
│   │   └── migrations/
│   ├── whatsapp_api/            # Gateway Node.js + Baileys
│   │   └── index.js             # WebSocket + REST hacia WhatsApp
│   ├── masssend.log             # Archivo de logs del sistema
│   └── manage.py
├── frontend/
│   └── src/
│       ├── App.jsx              # SPA layout + navegación
│       ├── context/
│       │   ├── AuthContext.jsx  # Contexto de autenticación JWT/Google
│       │   └── WaContext.jsx    # Estado global WhatsApp
│       ├── hooks/
│       │   └── useWebSocket.js  # Singleton WebSocket
│       └── pages/               # Chat, Campañas, Contactos, Importar CSV, Reportes
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
