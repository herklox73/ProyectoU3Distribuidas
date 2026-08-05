"""
Prueba de carga sobre la ruta SÍNCRONA del sistema: el Asistente IA
(/whatsapp/api/asistente/chat/), que llama a Ollama y bloquea hasta
obtener respuesta. Sirve para medir cómo se degrada la latencia cuando
sube la concurrencia (dato que hoy falta en la sección 4.2 del artículo).

Instalación:
    pip install locust

Uso:
    locust -f locustfile.py --host http://localhost:8000
    (o el host/puerto donde publicaste el backend, ej. Swarm en :8000)

Luego abre http://localhost:8089 en el navegador y lanza oleadas de
10, 50 y 100 usuarios (uno a la vez, no simultáneas) para tener puntos
comparables. Locust te da p50/p95/p99 y throughput automáticamente en
la pestaña "Charts" / "Statistics".

Antes de correr, configura estas dos variables de entorno (o edítalas
abajo) con un usuario real que ya exista en el sistema:
    MASSSEND_USER=tu_usuario
    MASSSEND_PASS=tu_password
"""
import os
import random

from locust import HttpUser, task, between

USERNAME = os.environ.get("MASSSEND_USER", "cambia_este_usuario")
PASSWORD = os.environ.get("MASSSEND_PASS", "cambia_esta_password")

PROMPTS = [
    "¿Cómo creo una campaña?",
    "¿Cómo importo mis contactos?",
    "Ayúdame a redactar un mensaje promocional",
    "¿Cómo conecto mi WhatsApp?",
]


class AsistenteIAUser(HttpUser):
    """Simula un usuario consultando el Asistente IA (ruta síncrona, bloqueante)."""

    wait_time = between(1, 2)

    def on_start(self):
        resp = self.client.post(
            "/api/token/",
            json={"username": USERNAME, "password": PASSWORD},
            name="/api/token/ (login)",
        )
        resp.raise_for_status()
        self.token = resp.json()["access"]

    @task
    def consultar_asistente(self):
        headers = {"Authorization": f"Bearer {self.token}"}
        prompt = random.choice(PROMPTS)
        with self.client.post(
            "/whatsapp/api/asistente/chat/",
            json={"prompt": prompt},
            headers=headers,
            name="/whatsapp/api/asistente/chat/ (sincrono)",
            catch_response=True,
        ) as r:
            if r.status_code != 200:
                r.failure(f"status {r.status_code}: {r.text[:200]}")
