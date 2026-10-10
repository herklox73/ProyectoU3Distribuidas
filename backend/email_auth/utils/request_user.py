"""
Usuario autenticado (JWT o sesión de Django) dentro de vistas DRF que
desactivan la autenticación de DRF con @authentication_classes([]).

Las rutas de MFA y de notificaciones identificaban la cuenta solo por el
correo enviado en el cuerpo, de modo que cualquiera podía activar el MFA
en una cuenta ajena o enviar correos desde la cuenta del sistema. Estas
funciones exigen que haya una sesión iniciada y que el correo coincida
con el del usuario autenticado.
"""
from .errors import AppError
from .text import normalize_email


def get_request_user(request):
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    django_request = getattr(request, "_request", request)
    try:
        result = JWTAuthentication().authenticate(django_request)
        if result:
            return result[0]
    except (InvalidToken, TokenError):
        pass
    # DRF reemplaza request.user por AnonymousUser cuando la vista usa
    # @authentication_classes([]); por eso se lee la sesión directamente.
    from django.contrib.auth import get_user as get_session_user
    user = get_session_user(django_request)
    if user is not None and user.is_authenticated:
        return user
    return None


def require_user(request):
    user = get_request_user(request)
    if user is None:
        raise AppError("Debes iniciar sesión.", 401)
    return user


def require_own_email(request, email):
    """El usuario autenticado solo puede operar sobre su propio correo."""
    user = require_user(request)
    target = normalize_email(email or "")
    own = {normalize_email(user.email or ""), normalize_email(user.username or "")}
    if not target or target not in own:
        raise AppError("Solo puedes administrar la seguridad de tu propia cuenta.", 403)
    return user
