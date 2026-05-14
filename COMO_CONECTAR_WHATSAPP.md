# ¿Cómo conectar WhatsApp? QR vs API de Meta

## Tu proyecto actual usa la API Oficial de Meta (WhatsApp Cloud API)

Con esta API, el proceso de conexión **NO usa QR**. En cambio:

1. Haces clic en "Iniciar sesión con Facebook" en la pantalla de bienvenida
2. Meta abre un popup donde autorizas tu cuenta de WhatsApp Business
3. Seleccionas (o creas) tu número de teléfono
4. Meta te envía un código SMS o llamada al número para verificarlo
5. ¡Listo! El número queda conectado

### Para usar con un número nuevo (chip nuevo):
- El número puede ser cualquier número (incluyendo tu chip nuevo)
- **Importante:** el número NO debe estar registrado como WhatsApp personal activo, 
  o debes migrarlo a WhatsApp Business primero
- Si el número ya tiene WhatsApp personal, Meta te pedirá que lo desactives primero

### Ventajas de la API oficial:
- ✅ Sin QR, sin celular encendido permanentemente
- ✅ Envío masivo aprobado (1000+ mensajes/día)
- ✅ Entrega confiable con estados en tiempo real
- ✅ No viola términos de servicio de WhatsApp

---

## Alternativa: QR con whatsapp-web.js (no oficial)

Si prefieres escanear QR con cualquier número personal, necesitarías:
- Un servidor Node.js con el paquete `whatsapp-web.js`
- Mantener el celular encendido y conectado
- Aceptar que Meta puede banear el número (viola sus términos)

**Esta opción NO está implementada en tu proyecto actual.**

---

## Conclusión

Con tu chip nuevo:
1. Actívalo, ponlo en un celular
2. **NO instales WhatsApp** personal en ese número
3. Usa el botón "Iniciar sesión con Facebook" de tu app
4. Sigue el proceso de Embedded Signup de Meta
5. Verifica el número con el SMS que te llegará al chip

¡Así de simple!
