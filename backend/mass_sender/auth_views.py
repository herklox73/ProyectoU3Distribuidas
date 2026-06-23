# backend/mass_sender/auth_views.py
import os
import logging
import urllib.parse
import requests

from django.conf import settings
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from requests_oauthlib import OAuth2Session
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)

# Permite HTTP en desarrollo local
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO  = "https://www.googleapis.com/oauth2/v2/userinfo"
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


@require_http_methods(["GET"])
def google_login(request):
    """
    Redirige al usuario a la pantalla de consentimiento de Google.
    GET /auth/google/
    """
    try:
        oauth = OAuth2Session(
            client_id=settings.GOOGLE_CLIENT_ID,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            scope=SCOPES,
        )
        authorization_url, state = oauth.authorization_url(
            GOOGLE_AUTH_URL,
            access_type="offline",
            prompt="select_account",
        )
        request.session['google_oauth_state'] = state
        logger.info("Iniciando flujo OAuth con Google")
        return redirect(authorization_url)
    except Exception as e:
        logger.error(f"Error iniciando OAuth: {e}")
        return redirect(f"{settings.FRONTEND_URL}/?error=oauth_init_failed")


@require_http_methods(["GET"])
def google_callback(request):
    """
    Recibe el código de Google, obtiene datos del usuario, genera JWT.
    GET /auth/google/callback/
    """
    try:
        code = request.GET.get("code")
        if not code:
            logger.warning("Callback de Google sin código de autorización")
            return redirect(f"{settings.FRONTEND_URL}/?error=no_code")

        # Intercambiar código por token de acceso
        token_resp = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")

        # Obtener datos del usuario desde Google
        userinfo_resp = requests.get(
            GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        userinfo_resp.raise_for_status()
        info = userinfo_resp.json()

        email     = info.get("email", "")
        nombre    = info.get("name", "")
        foto      = info.get("picture", "")
        google_id = info.get("id", "")

        logger.info(f"Usuario autenticado con Google: {email}")

        # Buscar o crear usuario en la base de datos
        user, created = User.objects.get_or_create(
            username=email,
            defaults={
                "email": email,
                "first_name": nombre.split(" ")[0] if nombre else "",
                "last_name": " ".join(nombre.split(" ")[1:]) if nombre else "",
            },
        )
        if created:
            user.set_unusable_password()
            user.save()
            logger.info(f"Nuevo usuario creado desde Google: {email}")

        # Generar JWT con datos de Google incluidos
        refresh = RefreshToken.for_user(user)
        refresh['email']     = email
        refresh['nombre']    = nombre
        refresh['foto']      = foto
        refresh['google_id'] = google_id
        jwt_token = str(refresh.access_token)

        logger.info(f"JWT generado para: {email}")

        params = urllib.parse.urlencode({
            "token": jwt_token,
            "nombre": nombre,
            "foto": foto,
            "email": email,
        })
        return redirect(f"{settings.FRONTEND_URL}/?{params}")

    except requests.RequestException as e:
        logger.error(f"Error llamando API de Google: {e}")
        return redirect(f"{settings.FRONTEND_URL}/?error=google_api_error")
    except Exception as e:
        logger.error(f"Error en callback OAuth: {e}")
        return redirect(f"{settings.FRONTEND_URL}/?error=auth_failed")


@csrf_exempt
@require_http_methods(["GET"])
def perfil_usuario(request):
    """
    Devuelve datos del usuario autenticado via JWT.
    GET /auth/perfil/
    Header requerido: Authorization: Bearer <token>
    """
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    try:
        auth = JWTAuthentication()
        validated = auth.authenticate(request)
        if not validated:
            return JsonResponse({"error": "Token requerido"}, status=401)

        user, token = validated
        return JsonResponse({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "nombre": token.get("nombre", user.get_full_name()),
            "foto": token.get("foto", ""),
            "google_id": token.get("google_id", ""),
        })
    except (InvalidToken, TokenError) as e:
        logger.warning(f"Token JWT inválido: {e}")
        return JsonResponse({"error": "Token inválido o expirado"}, status=401)
    except Exception as e:
        logger.error(f"Error obteniendo perfil: {e}")
        return JsonResponse({"error": "Error interno"}, status=500)
