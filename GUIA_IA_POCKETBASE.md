# MassSend — Asistente IA (Ollama) + almacenamiento en PocketBase

Integración de los dos temas del parcial en el sistema MassSend:

1. **Modelo de IA local (Ollama)** — nueva página "Asistente IA" en el menú: un chat que responde cómo usar el sistema y redacta mensajes para campañas. Django hace la llamada síncrona (RPC sobre HTTP) al modelo `qwen2.5:0.5b`, igual que en `ollama-rpc-practica`.
2. **PocketBase** — las fotos y videos de las campañas ya no se guardan en la carpeta `media/` de Django: se suben a la colección `campaign_media` de PocketBase y la campaña guarda solo la URL pública. Si PocketBase está apagado, se usa el almacenamiento local como respaldo (el sistema nunca se cae).

## Archivos nuevos / modificados

| Archivo | Qué hace |
|---|---|
| `backend/mass_sender/ai_service.py` | Cliente RPC de Ollama + contexto del sistema (nuevo) |
| `backend/mass_sender/ai_views.py` | Endpoints `/whatsapp/api/asistente/chat/` y `/health/` (nuevo) |
| `backend/mass_sender/pocketbase_media.py` | Sube fotos/videos a PocketBase, crea la colección sola (nuevo) |
| `backend/mass_sender/views.py` | Campañas: el media se envía a PocketBase con respaldo local (modificado) |
| `backend/mass_sender/urls.py` | Rutas del asistente (modificado) |
| `backend/core/settings.py` | Variables OLLAMA_* y POCKETBASE_* (modificado) |
| `frontend/src/pages/AsistentePage.jsx` | Página de chat con la IA (nuevo) |
| `frontend/src/App.jsx` | Menú y render de la nueva página (modificado) |
| `compose.yaml` + `infra/pocketbase/Dockerfile` | Levanta Ollama y PocketBase con Docker (nuevo) |

## Cómo ejecutar (TODO en Docker — arquitectura distribuida)

Los 6 servicios (frontend, backend, whatsapp, ollama, pocketbase) corren cada uno en su propio contenedor, comunicados por la red interna `masssend_network` — lo contrario de un monolito.

```powershell
docker compose up --build -d
docker exec -it masssend-ollama ollama pull qwen2.5:0.5b   # solo la primera vez
```

Luego abre http://localhost:5173 y listo: ya no necesitas runserver, npm run dev ni npm start — Docker levanta todo.

- La base de datos (`db.sqlite3`), la carpeta `media/` y la sesión de WhatsApp (`auth_info_baileys/`) se montan desde el host: son los mismos datos con o sin Docker, y no pierdes la sesión del QR.
- Dentro de la red Docker los servicios se hablan por nombre (`http://backend:8000`, `http://whatsapp:3001`, `http://pocketbase:8080`); el navegador entra por los puertos publicados (5173, 8000, 3001, 8090, 11434).
- Django traduce automáticamente la URL pública de PocketBase (localhost:8090, para el navegador) a la interna (pocketbase:8080) cuando Node necesita descargar la foto/video de una campaña.

Para verla: `docker compose ps` (6 contenedores) y `docker compose logs -f backend` si algo falla. Para apagar: `docker compose down` (los datos se conservan).

## Cómo ejecutar (modo mixto: solo Ollama y PocketBase en Docker)

1. Levantar los servicios (solo la primera vez tarda por las descargas):

```powershell
docker compose up --build -d
```

2. Descargar el modelo de IA (solo la primera vez; queda en el volumen):

```powershell
docker exec -it masssend-ollama ollama pull qwen2.5:0.5b
```

3. Arrancar el backend y frontend como siempre:

```powershell
cd backend; python manage.py runserver
cd frontend; npm run dev
```

4. Probar:
   - Menú → **Asistente IA** → pregunta "¿Cómo creo una campaña?" o pide "Redáctame un mensaje para...". La respuesta muestra el modelo y la latencia del RPC.
   - Menú → **Campañas** → crea una campaña con imagen/video. El archivo queda en PocketBase (revisa http://localhost:8090/_/ con `admin@masssend.local` / `masssend123456`, colección `campaign_media`) y la campaña guarda la URL pública.

## Conceptos para defender en el parcial

- **RPC síncrono sobre HTTP:** el navegador espera a Django y Django espera a Ollama (`POST /api/generate` con `stream: false`). La latencia mostrada en el chat evidencia el costo de la llamada remota.
- **IA local:** el modelo corre en tu máquina (contenedor Ollama), sin servicios de nube ni API keys.
- **Almacenamiento desacoplado:** los binarios (fotos/videos) viven en un servicio aparte (PocketBase) con su propio volumen persistente; Django solo guarda la URL. Varios componentes (Django, Node/WhatsApp, navegador) consumen el mismo archivo por HTTP.
- **Tolerancia a fallos:** si PocketBase no responde, el sistema hace *fallback* al disco local en vez de fallar.
