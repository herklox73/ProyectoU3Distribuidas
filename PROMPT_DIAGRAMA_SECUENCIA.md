# Prompt para el diagrama de secuencia general (MassSend)

Usa esto en Claude.ai, ChatGPT o pégalo directo en https://mermaid.live (funciona sin IA):

---

```
Genera un diagrama de secuencia en sintaxis Mermaid (sequenceDiagram) que
muestre el flujo GENERAL de un sistema distribuido llamado MassSend, desde
que el usuario inicia sesión hasta que se ejecuta una campaña de WhatsApp
con archivo multimedia. Debe incluir estos participantes, en este orden:

- Usuario (navegador)
- Frontend (React/Nginx)
- Backend (Django)
- BaseDatos (SQLite)
- PocketBase
- Ollama
- WhatsApp (Node/Baileys)
- Telefono (destinatario)

El flujo debe cubrir, en orden:

1. Usuario ingresa credenciales -> Frontend -> Backend valida contraseña.
2. Backend detecta que tiene 2FA activo y responde "requiere TOTP".
3. Usuario ingresa código TOTP -> Backend valida y abre sesión (JWT).
4. Usuario pide al Asistente IA que redacte un mensaje -> Backend arma el
   prompt -> llamada SINCRONA (RPC) a Ollama -> Ollama responde el texto
   con la latencia -> Backend lo devuelve al Frontend.
5. Usuario crea una campaña con foto -> Backend sube el archivo a
   PocketBase (coleccion privada, protegido) -> PocketBase devuelve la
   referencia -> Backend guarda la campaña en BaseDatos.
6. Usuario ejecuta la campaña -> Backend abre una transaccion, valida
   creditos en BaseDatos, descarga el archivo protegido de PocketBase con
   un token temporal, y ENCOLA de forma ASINCRONA cada mensaje en el
   servicio WhatsApp (nota: "el backend no espera aqui").
7. WhatsApp procesa su cola de forma asincrona: por cada mensaje, lo envia
   al Telefono, y luego notifica el resultado a Backend mediante un
   webhook.
8. Backend actualiza el progreso en BaseDatos y lo empuja al Frontend por
   WebSocket (evento asincrono, sin que el Frontend pregunte).

Usa flechas solidas (->>) para llamadas sincronas donde se espera
respuesta inmediata, y flechas con nota aclaratoria "(asincrono)" para las
que no bloquean (la cola de WhatsApp, el webhook y el WebSocket). Agrupa
con "rect" o "Note over" tres bloques visibles: "Autenticacion",
"Asistente IA (RPC sincrono)" y "Campana con almacenamiento protegido y
cola asincrona". Al final, agrega notas breves indicando cuáles pasos son
comunicación síncrona y cuáles asíncrona.
```

---

## Si quieres un segundo diagrama más simple (solo para la portada/intro)

```
Genera un diagrama de secuencia Mermaid simplificado, de máximo 8 pasos,
que muestre solo lo esencial: Usuario -> Frontend -> Backend -> (en
paralelo, de forma asíncrona) Cola de WhatsApp -> Teléfono destinatario,
y el resultado volviendo por WebSocket al Frontend. Debe ser legible en
una sola diapositiva, con letra grande y pocas flechas.
```

## Tip

- En **mermaid.live** puedes exportar directo a PNG/SVG para pegar en tu informe o diapositivas — no necesitas pasar por otra IA.
- Si usas Claude o ChatGPT, pídeles el código Mermaid (no una imagen): así puedes editarlo tú mismo y corregir cualquier detalle antes de exportar.
