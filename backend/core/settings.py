"""
Django settings for core project.
"""

import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv

load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# ── Unfold Admin Theme ────────────────────────────────────────────
UNFOLD = {
    "SITE_TITLE": "MassSend",
    "SITE_HEADER": "MassSend — Panel de Control",
    "SIDEBAR": {
        "navigation": [
            {
                "title": "Mensajería",
                "items": [
                    {
                        "title": "Contactos",
                        "link": "/admin/mass_sender/contact/",
                        "icon": "person",
                    },
                    {
                        "title": "Campañas",
                        "link": "/admin/mass_sender/campaign/",
                        "icon": "campaign",
                    },
                    {
                        "title": "Mensajes",
                        "link": "/admin/mass_sender/message/",
                        "icon": "chat",
                    },
                    {
                        "title": "Proveedores de API",
                        "link": "/admin/mass_sender/apiprovider/",
                        "icon": "settings",
                    },
                ],
            },
            {
                "title": "Herramientas",
                "items": [
                    {
                        "title": "Chat WhatsApp",
                        "link": "/admin/chat/",
                        "icon": "chat_bubble",
                    },
                    {
                        "title": "Reportes",
                        "link": "/admin/reportes/",
                        "icon": "bar_chart",
                    },
                    {
                        "title": "Importar Contactos CSV",
                        "link": "/admin/import-contacts/",
                        "icon": "upload_file",
                    },
                    {
                        "title": "Cambiar Número WhatsApp",
                        "link": "/admin/cambiar-numero/",
                        "icon": "phonelink_setup",
                    },
                ],
            },
            {
                "title": "Administración",
                "items": [
                    {
                        "title": "Usuarios",
                        "link": "/admin/auth/user/",
                        "icon": "manage_accounts",
                    },
                    {
                        "title": "Grupos",
                        "link": "/admin/auth/group/",
                        "icon": "group",
                    },
                ],
            },
        ]
    },
}


# ── Seguridad ─────────────────────────────────────────────────────
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-8w_in7kr8x2_ns3=#(wio)_j#xi#lc803z57c6w8or4huw*z+v')

DEBUG = os.environ.get('DEBUG', 'False') == 'True'

ALLOWED_HOSTS_ENV = os.environ.get('ALLOWED_HOSTS', '')
ALLOWED_HOSTS = [h.strip() for h in ALLOWED_HOSTS_ENV.split(',') if h.strip()] if ALLOWED_HOSTS_ENV else ['*']


# ── Aplicaciones ──────────────────────────────────────────────────
INSTALLED_APPS = [
    'unfold',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'mass_sender',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'global_templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# ── Base de datos ─────────────────────────────────────────────────
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600,
            ssl_require=True,
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


# ── Validadores de contraseña ─────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ── Internacionalización ──────────────────────────────────────────
LANGUAGE_CODE = 'es-es'
TIME_ZONE = 'America/Lima'
USE_I18N = True
USE_TZ = True


# ── Archivos estáticos ────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ── Media (archivos subidos) ──────────────────────────────────────
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ── Clave primaria por defecto ────────────────────────────────────
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Servicio WhatsApp API (Node.js) ───────────────────────────────
WHATSAPP_API_URL = os.environ.get('WHATSAPP_API_URL', 'http://localhost:3000')
