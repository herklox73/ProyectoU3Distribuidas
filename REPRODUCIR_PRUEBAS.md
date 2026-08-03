# Reproducción de las pruebas del artículo científico

Este archivo documenta, para cada una de las 15 pruebas funcionales reportadas en el
artículo (Tabla "Plan de pruebas funcionales", sección Metodología), el procedimiento
exacto y los comandos necesarios para repetirlas sobre un despliegue equivalente.
Todas las pruebas se ejecutaron al menos 3 veces bajo las mismas condiciones.

Entorno de referencia: ver Anexo A del artículo ("Entorno de reproducibilidad") y
`stack.yml` / `compose.yaml` en la raíz de este repositorio.

## Preparación del entorno

```powershell
git clone https://github.com/herklox73/ProyectoU3Distribuidas.git
cd ProyectoU3Distribuidas
cp backend/.env.example backend/.env   # completar variables reales antes de continuar
docker compose build
docker swarm init                       # solo la primera vez
docker stack deploy --resolve-image never -c stack.yml masssend
docker exec -it $(docker ps -q -f name=masssend_ollama) ollama pull qwen2.5:0.5b
```

## Pruebas 1-3 y 15 — Disponibilidad, balanceo y persistencia (V1, V2, V3)

| # | Prueba | Comando / procedimiento | Métrica |
|---|--------|--------------------------|---------|
| 1 | Despliegue del clúster | `docker stack services masssend` (frontend debe mostrar 3/3, resto 1/1) | V1 |
| 2 | Balanceo de solicitudes | Recargar `http://localhost:5173` 8-10 veces, luego `docker service logs masssend_frontend --tail 30` y verificar que aparecen las 3 réplicas | V2 |
| 3 | Tolerancia a fallos | `docker service ps masssend_frontend` para obtener el ID de una tarea, `docker kill <id_contenedor>` y observar con `docker service ps masssend_frontend` la reprogramación | V3 |
| 15 | Persistencia | `docker stack rm masssend` seguido de `docker stack deploy --resolve-image never -c stack.yml masssend`; verificar que los datos siguen en la base (login, campañas previas) | V1 |

## Pruebas 4-5 — Asistente de IA / latencia síncrona (V4)

| # | Prueba | Procedimiento | Métrica |
|---|--------|----------------|---------|
| 4 | Asistente IA (RPC) | Iniciar sesión, ir a "Asistente IA", enviar una consulta; el backend registra la latencia en `backend/logs/` | V4 |
| 5 | IA sin servicio disponible | `docker service scale masssend_ollama=0`, repetir la consulta (debe responder error controlado 502), luego `docker service scale masssend_ollama=1` para restaurar | V4 |

## Pruebas 6-8 — Almacenamiento protegido (V6)

| # | Prueba | Procedimiento | Métrica |
|---|--------|----------------|---------|
| 6 | Carga protegida de archivo | Crear una campaña adjuntando una imagen o video desde la UI | V6 |
| 7 | Acceso autorizado | Con sesión iniciada, abrir `http://localhost:8000/whatsapp/api/campanas/<id>/media/` | V6 |
| 8 | Acceso no autorizado | Repetir la URL anterior en ventana de incógnito (sin sesión) y la URL directa de PocketBase (`http://localhost:8090/api/files/...`); ambas deben rechazar el acceso | V6 |

## Pruebas 9-14 — Colas asíncronas, cuentas, pagos (V5, V6)

| # | Prueba | Procedimiento | Métrica |
|---|--------|----------------|---------|
| 9 | Envío con archivo multimedia | Ejecutar una campaña real con imagen/video hacia un número de prueba | V5 |
| 10 | Cola de correos | Registrar una cuenta nueva o enviar una notificación con adjunto; revisar el panel "Cola de correos" en el admin | V5 |
| 11 | Verificación y recuperación | Verificar cuenta por correo (OTP) y usar "olvidé mi contraseña" | V5, V6 |
| 12 | Segundo factor (TOTP) | Activar 2FA en "Seguridad", cerrar sesión y volver a entrar con código correcto e incorrecto | V6 |
| 13 | Pago en sandbox | Comprar créditos usando las credenciales de prueba del proveedor de pago (sandbox) | V6 |
| 14 | Consistencia de créditos | Ejecutar una campaña con saldo insuficiente; debe bloquear sin descuento parcial | V1, V6 |

## Instrumentación de la latencia (V4)

El fragmento exacto usado para medir la latencia de la llamada RPC síncrona está en
`backend/mass_sender/ai_service.py` (ver Código 2 del artículo) y se basa en
`time.perf_counter()` alrededor de la llamada `POST /api/generate` a Ollama.

## Evidencias

Las capturas de pantalla correspondientes a cada prueba (28 figuras numeradas) están
insertadas en el informe técnico del proyecto, en el mismo orden en que aparecen las
pruebas de este documento.
