# Texto para Napkin AI — Diagrama de secuencia general de MassSend

Instrucciones de uso: entra a napkin.ai, pega el bloque de texto de abajo
en el editor (tal cual, en prosa), genera el visual, y elige el estilo
"Sequence" o "Flow" en el panel de sugerencias. Napkin detecta los pasos
y los actores automáticamente a partir de las oraciones numeradas.

---

## Texto a pegar en Napkin

```
Flujo general del sistema distribuido MassSend, con ocho participantes:
Usuario, Frontend, Backend, Base de Datos, PocketBase, Ollama, Servicio
WhatsApp y Teléfono del destinatario.

Primero, el Usuario envía sus credenciales al Frontend, y el Frontend las
reenvía al Backend. El Backend verifica la contraseña contra la Base de
Datos y detecta que la cuenta tiene verificación en dos pasos activada,
así que responde pidiendo el código TOTP. El Usuario ingresa el código
TOTP, el Backend lo valida contra la Base de Datos y, si es correcto,
abre la sesión y entrega un token JWT al Frontend. Esta primera parte es
comunicación síncrona.

Segundo, el Usuario le pide al Asistente de Inteligencia Artificial que
redacte un mensaje de campaña. El Frontend envía la pregunta al Backend,
y el Backend realiza una llamada RPC síncrona al servicio Ollama,
esperando bloqueado la respuesta completa. Ollama genera el texto y lo
devuelve junto con la latencia de la operación. El Backend reenvía la
respuesta al Frontend.

Tercero, el Usuario crea una campaña con una foto o video adjunto. El
Frontend envía el formulario al Backend. El Backend sube el archivo al
servicio PocketBase, a una colección privada con el archivo marcado como
protegido, y PocketBase devuelve una referencia del archivo. El Backend
guarda la campaña con esa referencia en la Base de Datos. Esta parte
también es síncrona.

Cuarto, el Usuario ejecuta la campaña. El Backend abre una transacción,
valida y descuenta los créditos en la Base de Datos, descarga el archivo
protegido de PocketBase usando un token temporal, y encola cada mensaje
personalizado en el Servicio WhatsApp sin esperar su procesamiento: esto
es comunicación asíncrona. El Backend responde de inmediato al Frontend
que la ejecución inició.

Quinto, el Servicio WhatsApp procesa su cola de mensajes de forma
asíncrona, enviando cada mensaje con su archivo al Teléfono del
destinatario. Por cada envío, el Servicio WhatsApp notifica el resultado
al Backend mediante un webhook, también asíncrono. El Backend actualiza
el progreso en la Base de Datos y lo transmite al Frontend mediante un
WebSocket, un canal asíncrono en tiempo real, y el Frontend actualiza la
barra de progreso que ve el Usuario.
```

---

## Notas para editar en Napkin

- Si el diagrama sale muy denso, pide a Napkin "dividir en 4 diagramas"
  usando cada párrafo numerado (Autenticación / IA / Crear campaña /
  Ejecutar campaña) — quedan más legibles para una diapositiva.
- En el panel de estilos de Napkin, prueba "Sequence flow" o "Process
  flow" y compara cuál se lee mejor con 8 participantes.
- Napkin permite exportar a PNG/SVG y editar cajas y flechas a mano
  después de generado — ajusta colores para que combinen con tu deck.
