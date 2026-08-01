"""
MFA (segundo factor) + login con verificación de 2FA.
Equivalente Django de mfa.controller.js / mfa.routes.js.

`login_step1` reemplaza (desde el frontend) al login clásico de
`mass_sender.views.api_login` cuando la cuenta tiene perfil de
seguridad: primero valida usuario/contraseña, y si la cuenta tiene
MFA activo, NO abre sesión todavía y pide el segundo factor a
`login_step2`. Si no tiene MFA, abre la sesión de una vez (mismo
comportamiento que el login normal).

Se desactiva SessionAuthentication de DRF (no CSRF check) porque
estos endpoints identifican la cuenta por el correo del body, no por
`request.user`; `django_login()` sigue funcionando igual, ya que
trabaja directo sobre `request.session`.
"""
from django.contrib.auth import login as django_login
from rest_framework.decorators import api_view, authentication_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from ..services import mfa_service
from ..utils.errors import AppError
from ..utils.text import normalize_email


@api_view(["POST"])
@authentication_classes([])
def setup(request):
    result = mfa_service.start_mfa_setup(request.data.get("email"))
    return Response(result, status=200)


@api_view(["POST"])
@authentication_classes([])
def confirm(request):
    result = mfa_service.confirm_mfa_setup(
        email=request.data.get("email"),
        code=request.data.get("code"),
    )
    return Response(result, status=200)


@api_view(["POST"])
@authentication_classes([])
def login_step1(request):
    user, payload = mfa_service.login_first_step(
        email=request.data.get("email"),
        password=request.data.get("password"),
    )
    if user is not None:
        django_login(request, user)
    return Response(payload, status=200)


@api_view(["POST"])
@authentication_classes([])
def login_step2(request):
    user, payload = mfa_service.verify_mfa_login(
        email=request.data.get("email"),
        code=request.data.get("code"),
    )
    django_login(request, user)
    return Response(payload, status=200)


@api_view(["GET"])
@authentication_classes([])
def status(request, email):
    result = mfa_service.get_mfa_status(email)
    return Response(result, status=200)


@api_view(["POST"])
@authentication_classes([])
def disable(request):
    result = mfa_service.disable_mfa(
        email=request.data.get("email"),
        password=request.data.get("password"),
    )
    return Response(result, status=200)


@api_view(["POST"])
@authentication_classes([])
def google_login_verify(request):
    """
    Segundo factor para el login con Google. `mass_sender.auth_views.
    google_callback` ya validó la identidad con Google y, si la cuenta
    tiene MFA activo, guardó el perfil (nombre/foto/google_id) en
    `request.session` en vez de emitir el JWT de una vez. Aquí se
    valida el código del autenticador y, recién si es correcto, se
    genera el JWT final (mismo formato que el login directo con
    Google) usando esos datos guardados.
    """
    email = request.data.get("email")
    code = request.data.get("code")

    user, _payload = mfa_service.verify_mfa_login(email=email, code=code)

    pending = request.session.pop("pending_google_profile", None)
    if not pending or normalize_email(pending.get("email")) != normalize_email(email):
        raise AppError(
            "La sesión de Google expiró o no coincide. Vuelve a iniciar sesión con Google.", 400,
        )

    refresh = RefreshToken.for_user(user)
    refresh["email"] = pending["email"]
    refresh["nombre"] = pending.get("nombre", "")
    refresh["foto"] = pending.get("foto", "")
    refresh["google_id"] = pending.get("google_id", "")
    refresh["is_staff"] = user.is_staff

    return Response({
        "message": "Inicio de sesión completado con segundo factor.",
        "token": str(refresh.access_token),
        "nombre": pending.get("nombre", ""),
        "foto": pending.get("foto", ""),
        "email": pending["email"],
        "isStaff": user.is_staff,
    }, status=200)
