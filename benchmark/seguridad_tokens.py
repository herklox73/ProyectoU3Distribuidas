"""
Matriz de pruebas de seguridad sobre el endpoint de archivos protegidos
(GET /whatsapp/api/campanas/<id>/media/), tal como pide la
retroalimentación: token manipulado, token expirado y token de otro
usuario (IDOR).

HALLAZGO IMPORTANTE (revisado en el código, backend/mass_sender/views.py,
función api_campanas_media): el endpoint solo valida que exista un
usuario autenticado (JWT o sesión), pero NO valida que ese usuario sea el
dueño de la campaña, y el modelo Campaign tampoco tiene un campo de
dueño (usuario/owner). Es decir: cualquier usuario autenticado del
sistema puede ver el archivo de CUALQUIER campaña con solo cambiar el
<id> en la URL. Este script lo demuestra con datos (prueba 3, abajo) en
vez de dejarlo como sospecha.

Antes de correr:
  1. Crea DOS usuarios de prueba en el sistema (usuario A y usuario B).
  2. Con el usuario A, crea una campaña con un archivo adjunto (imagen o
     video) y anota su ID.
  3. Configura las variables de entorno de abajo.

Instalación:
    pip install pyjwt requests

Uso (PowerShell):
    $env:MASSSEND_USER_A="usuarioA"
    $env:MASSSEND_PASS_A="passwordA"
    $env:MASSSEND_USER_B="usuarioB"
    $env:MASSSEND_PASS_B="passwordB"
    $env:MASSSEND_CAMPANA_A="5"
    python seguridad_tokens.py
"""
import os
import time
from pathlib import Path

import jwt
import requests

BASE_URL = os.environ.get("MASSSEND_URL", "http://localhost:8000")
USER_A = os.environ.get("MASSSEND_USER_A", "usuarioA")
PASS_A = os.environ.get("MASSSEND_PASS_A", "passwordA")
USER_B = os.environ.get("MASSSEND_USER_B", "usuarioB")
PASS_B = os.environ.get("MASSSEND_PASS_B", "passwordB")
CAMPANA_DE_A = int(os.environ.get("MASSSEND_CAMPANA_A", "0"))

DEFAULT_INSECURE_KEY = "django-insecure-8w_in7kr8x2_ns3=#(wio)_j#xi#lc803z57c6w8or4huw*z+v"


def leer_secret_key() -> str:
    """Lee SECRET_KEY/JWT_SECRET_KEY de backend/.env (mismo valor que usa Django)."""
    env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("JWT_SECRET_KEY=") or line.startswith("SECRET_KEY="):
                return line.split("=", 1)[1].strip()
    return DEFAULT_INSECURE_KEY


def login(username: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/token/", json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access"]


def probar(nombre: str, token, esperado: int) -> int:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.get(f"{BASE_URL}/whatsapp/api/campanas/{CAMPANA_DE_A}/media/", headers=headers)
    marca = "OK" if r.status_code == esperado else "**FALLA**"
    print(f"[{marca}] {nombre}: esperado={esperado} obtenido={r.status_code}")
    return r.status_code


def main():
    if CAMPANA_DE_A == 0:
        raise SystemExit("Configura MASSSEND_CAMPANA_A con el ID de una campaña de A que tenga archivo adjunto.")

    print("== Matriz de seguridad: acceso al almacenamiento protegido ==\n")

    probar("1. Sin token", None, 401)

    token_a = login(USER_A, PASS_A)
    probar("2. Token válido del dueño (A)", token_a, 200)

    token_b = login(USER_B, PASS_B)
    probar(
        "3. Token válido de OTRO usuario (B) sobre el archivo de A [prueba IDOR]",
        token_b,
        403,
    )

    manipulado = token_a[:-4] + ("0000" if token_a[-4:] != "0000" else "1111")
    probar("4. Token con firma manipulada", manipulado, 401)

    secret = leer_secret_key()
    payload = jwt.decode(token_a, options={"verify_signature": False})
    payload["exp"] = int(time.time()) - 3600
    payload["iat"] = int(time.time()) - 7200
    expirado = jwt.encode(payload, secret, algorithm="HS256")
    probar("5. Token expirado (firma válida, exp vencido)", expirado, 401)

    print(
        "\nSi la prueba 3 aparece como **FALLA** (obtenido=200), confirma el hallazgo:"
        " falta un chequeo de dueño en api_campanas_media. La corrección requiere"
        " agregar un campo de dueño a Campaign (FK a User) + migración, y filtrar"
        " por ese dueño en la vista — es un cambio de modelo, no una línea suelta."
    )


if __name__ == "__main__":
    main()
