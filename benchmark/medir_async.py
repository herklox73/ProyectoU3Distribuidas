"""
Mide el tiempo de RESPUESTA del endpoint que ENCOLA una campaña
(ruta asíncrona: POST /whatsapp/api/campanas/<id>/ejecutar/) bajo
distintos niveles de concurrencia, para contrastarlo contra la latencia
síncrona del Asistente IA medida con locustfile.py.

La idea que hay que demostrar con números (hoy está solo en prosa en la
sección 4.2 del artículo): el productor (este endpoint) responde casi de
inmediato sin importar la carga, porque el envío real ocurre en un hilo
en segundo plano.

  ⚠ SEGURIDAD DE LA PRUEBA — LEE ESTO ANTES DE CORRER:
  Este endpoint SÍ dispara el envío real por WhatsApp en segundo plano.
  Antes de ejecutar este script:
    1. Crea en la app una campaña de prueba dedicada (ej. nombre
       "BENCHMARK") cuyo único contacto seas tú mismo (tu propio número
       de prueba), o un contacto de etiqueta que no reciba spam real.
    2. Copia su ID (se ve en la URL del panel o en /api/campanas/) y
       ponlo en MASSSEND_CAMPANA_ID.
  NO apuntes esto a una campaña con contactos reales: cada repetición
  vuelve a disparar el envío completo a esa lista.

Instalación:
    pip install requests

Uso (PowerShell):
    $env:MASSSEND_USER="tu_usuario"
    $env:MASSSEND_PASS="tu_password"
    $env:MASSSEND_CAMPANA_ID="3"
    python medir_async.py
"""
import concurrent.futures
import os
import statistics
import time

import requests

BASE_URL = os.environ.get("MASSSEND_URL", "http://localhost:8000")
USERNAME = os.environ.get("MASSSEND_USER", "cambia_este_usuario")
PASSWORD = os.environ.get("MASSSEND_PASS", "cambia_esta_password")
CAMPANA_ID = int(os.environ.get("MASSSEND_CAMPANA_ID", "0"))
NIVELES_CONCURRENCIA = [1, 10, 50]
PAUSA_ENTRE_NIVELES_S = 5  # deja drenar la cola antes del siguiente nivel


def login() -> str:
    r = requests.post(f"{BASE_URL}/api/token/", json={"username": USERNAME, "password": PASSWORD})
    r.raise_for_status()
    return r.json()["access"]


def disparar(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    t0 = time.perf_counter()
    r = requests.post(f"{BASE_URL}/whatsapp/api/campanas/{CAMPANA_ID}/ejecutar/", headers=headers)
    dt_ms = (time.perf_counter() - t0) * 1000
    return dt_ms, r.status_code


def percentil(valores, p):
    valores = sorted(valores)
    k = max(0, min(len(valores) - 1, int(round(p * (len(valores) - 1)))))
    return valores[k]


def main():
    if CAMPANA_ID == 0:
        raise SystemExit(
            "Configura MASSSEND_CAMPANA_ID con el ID de tu campaña de prueba antes de correr esto."
        )
    token = login()
    print("== Latencia del endpoint asíncrono (productor) por nivel de concurrencia ==")
    for n in NIVELES_CONCURRENCIA:
        with concurrent.futures.ThreadPoolExecutor(max_workers=n) as ex:
            resultados = list(ex.map(lambda _: disparar(token), range(n)))
        tiempos = [r[0] for r in resultados]
        errores = [r for r in resultados if r[1] != 200]
        print(f"\nConcurrencia={n}")
        print(f"  media = {statistics.mean(tiempos):.1f} ms")
        print(f"  p95   = {percentil(tiempos, 0.95):.1f} ms")
        print(f"  p99   = {percentil(tiempos, 0.99):.1f} ms")
        print(f"  errores = {len(errores)}/{n}")
        time.sleep(PAUSA_ENTRE_NIVELES_S)


if __name__ == "__main__":
    main()
