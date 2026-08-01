# Comandos para la defensa — MassSend

sb-mscwy52071039@personal.example.com
9&4G0yKM

```powershell
cd "D:\Carlos Asus\Descargas\Distribuidas whasapp\whatsApp"

docker compose build                  # construir las 4 imágenes
docker swarm init                     # solo si nunca lo has hecho (si dice "already part of a swarm", ignora)
docker stack deploy --resolve-image never -c stack.yml masssend
# IMPORTANTE: se despliega DIRECTO desde stack.yml. NO uses
# "docker compose -f stack.yml config | docker stack deploy -c - masssend":
# ese paso intermedio convierte los puertos a texto y Swarm los rechaza
# con el error "published must be a integer".

# modelo de IA (solo la primera vez, queda en el volumen)
docker exec -it $(docker ps -q -f name=masssend_ollama) ollama pull qwen2.5:0.5b
```

Verifica que todo esté arriba y que WhatsApp esté conectado (QR escaneado) ANTES de la clase.

---

## DURANTE la demo — evidencias del clúster

```powershell
# 1. Servicios y réplicas (la estrella: frontend 3/3)
docker stack services masssend

# 2. Las 3 réplicas del frontend con su estado
docker service ps masssend_frontend

# 3. BALANCEO: recarga localhost:5173 varias veces (Ctrl+Shift+R) y muestra
#    cómo las peticiones caen en réplicas distintas (.1, .2, .3)
docker service logs masssend_frontend --tail 20

# 4. TOLERANCIA A FALLOS (efecto wow): mata una réplica y Swarm la revive
docker ps -f name=masssend_frontend          # copia un CONTAINER ID
docker kill <CONTAINER_ID>
docker service ps masssend_frontend          # se ve la muerta (Failed) y la nueva (Running)
# y la app en localhost:5173 NUNCA dejó de responder
```

## DURANTE la demo — colas, IA y almacenamiento

```powershell
# 5. Consumidor de la cola de WhatsApp en vivo (déjalo corriendo en una
#    terminal MIENTRAS ejecutas la campaña: se ven las líneas [Queue])
docker service logs -f masssend_whatsapp

# 6. Logs del backend (confirmación de pagos, PocketBase, IA)
docker service logs masssend_backend --tail 30

# 7. Modelos de IA cargados en Ollama
docker exec -it $(docker ps -q -f name=masssend_ollama) ollama list

# 8. Contenedores corriendo (los 7: 3 frontend + 4 servicios)
docker ps

# 9. Volúmenes persistentes (BD única, modelos, sesión, PocketBase)
docker volume ls | findstr masssend
```

# Bajar el stack completo del clúster (detiene y elimina los servicios y contenedores)

docker stack rm masssend

# Verificar que ya no quede nada corriendo

docker service ls
docker ps

## URLs para el navegador

- App (por las réplicas balanceadas): **http://localhost:5173**
- Panel PocketBase: **http://localhost:8090/\_/** (admin@masssend.local / masssend123456)
- Prueba de PROTECCIÓN de archivos: ventana de incógnito →
  - URL directa del archivo de PocketBase → error (colección privada)
  - `http://localhost:8000/whatsapp/api/campanas/1/media/` → **401 No autenticado**
  - Con sesión iniciada, la misma ruta SÍ muestra el archivo
- API de Ollama viva: `http://localhost:11434/api/tags`

---

## Si algo sale mal (plan B)

```powershell
docker service ps masssend_backend --no-trunc     # ver por qué un servicio falló
docker stack rm masssend                          # bajar el stack
docker stack deploy --resolve-image never -c stack.yml masssend   # re-desplegar (1 min)

# Plan B total: modo Compose (mismos servicios, sin réplicas)
docker stack rm masssend
docker compose up -d
```

## Frases clave mientras muestras cada comando

- `stack services` → "Swarm mantiene el estado deseado: 3 réplicas del frontend, una sola instancia de la base de datos para garantizar consistencia."
- `service logs` con recargas → "La malla ingress balancea cada solicitud por round-robin entre réplicas."
- `docker kill` → "El estado real dejó de coincidir con el deseado y Swarm reprogramó la réplica automáticamente: tolerancia a fallos."
- Logs `[Queue]` → "Este es el consumidor de la cola: Django produjo las tareas, Node las consume por lotes sin bloquear la aplicación — comunicación asíncrona."
- Asistente IA → "RPC síncrono sobre HTTP a un modelo local: la latencia que ven es el costo de la llamada remota."
- 401 en incógnito → "Los archivos viven en una colección privada con archivo protegido: solo el backend, validando sesión o JWT, puede entregarlos."
