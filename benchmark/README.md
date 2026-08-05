# Benchmark y pruebas para la retroalimentación del docente

Scripts para generar los datos que pide la retroalimentación (carga
concurrente, comparación síncrono/asíncrono, RTO ante fallos, matriz de
seguridad). Nada de esto es necesario para la entrega de hoy — es para
una siguiente versión del artículo o la tesis.

## Orden sugerido

1. **Con el stack ya desplegado** (`docker stack deploy --resolve-image never -c stack.yml masssend`):

2. `locustfile.py` — carga sobre la ruta síncrona (Asistente IA).
   ```
   pip install locust
   $env:MASSSEND_USER="tu_usuario"; $env:MASSSEND_PASS="tu_password"
   locust -f locustfile.py --host http://localhost:8000
   ```
   Abre http://localhost:8089, corre oleadas de 10 → 50 → 100 usuarios.

3. `medir_async.py` — la misma idea pero para la ruta asíncrona (encolar
   campaña). **Lee las advertencias dentro del archivo antes de correrlo**:
   necesita una campaña de prueba con un solo contacto tuyo, para no
   spamear contactos reales en cada repetición.
   ```
   pip install requests
   $env:MASSSEND_CAMPANA_ID="<id de tu campaña de prueba>"
   python medir_async.py
   ```

4. `chaos_rto.ps1` — mata una réplica del frontend y mide cuánto tarda
   Swarm en recuperarse (RTO). Córrelo en una terminal aparte mientras
   `locustfile.py` o `medir_async.py` generan carga en otra, para que el
   RTO se mida bajo condiciones reales.
   ```
   .\chaos_rto.ps1
   ```
   Repite al menos 5 veces para reportar un promedio.

5. `seguridad_tokens.py` — matriz de seguridad del almacenamiento
   protegido: sin token, token del dueño, token de otro usuario (IDOR),
   token manipulado, token expirado.
   ```
   pip install pyjwt requests
   python seguridad_tokens.py
   ```
   **Ya reviné el código y esta prueba va a fallar en el caso 3**: el
   endpoint `api_campanas_media` no valida que el usuario sea dueño de la
   campaña, y el modelo `Campaign` ni siquiera tiene un campo de dueño.
   Es un hallazgo real, no un bug del script — repórtalo así en la
   sección de seguridad, o corrígelo (agregar FK de usuario a `Campaign`
   + migración + filtro en la vista) antes de reportarlo como resuelto.

## Multi-host (pendiente, no incluido aquí)

Estos scripts corren igual apuntando a un solo host o a un swarm de
varios nodos — no hace falta cambiar nada en ellos. Para el swarm
multi-nodo: levantar 2-3 VMs (Oracle Cloud free tier u otro proveedor),
`docker swarm join --token <token> <ip-manager>:2377` desde cada una, y
volver a desplegar `stack.yml` sobre ese swarm ampliado.
