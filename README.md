# 🚀 Guía de Ejecución: MassSend (WhatsApp Masivo)

Este proyecto ha sido modernizado y separado del antiguo CRM. Ahora funciona de manera **independiente** con dos motores principales:
1. **El Cerebro (Python/Django):** Administra la base de datos, los contactos, las campañas y provee la interfaz web.
2. **El Motor (Node.js):** Se conecta a WhatsApp Web para enviar los mensajes físicos sin ningún costo de API.

Para que el sistema funcione correctamente, **ambos servidores deben estar encendidos al mismo tiempo**.

---

## 🛠️ 1. Iniciar el Motor de WhatsApp (Node.js)

Este servidor es el que hace la conexión física con tu celular. 

1. Abre una terminal en Visual Studio Code.
2. Navega a la carpeta de la API de WhatsApp:
   ```powershell
   cd "backend/whatsapp_api"
   ```
3. Enciende el servidor:
   ```powershell
   node index.js
   ```
4. **IMPORTANTE:** Si es la primera vez que lo corres (o si cerraste sesión), aparecerá un código QR en la consola. Escanéalo con tu celular (WhatsApp > Dispositivos Vinculados). Cuando diga *"✅ ¡WhatsApp conectado exitosamente!"*, déjalo corriendo.

---

## 🧠 2. Iniciar el Cerebro Administrativo (Django)

Este servidor es el que te muestra el panel de control y el diseño del chat.

1. Abre **otra** nueva terminal en Visual Studio Code (puedes usar el botón `+` para abrir una segunda ventana).
2. Navega a la carpeta principal del backend:
   ```powershell
   cd backend
   ```
3. Activa el entorno virtual de Python:
   ```powershell
   .\venv\Scripts\activate
   ```
4. Enciende el servidor de Django:
   ```powershell
  .\venv\Scripts\activate
   ```

---

## 💻 3. Usar el Sistema

Una vez que ambos servidores estén corriendo (uno en cada consola), abre tu navegador Google Chrome:

* **Panel Administrativo (Contactos y Campañas):**
  👉 [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/)
* **Diseño del Chat Interactivo:**
  👉 [http://127.0.0.1:8000/whatsapp/chat/](http://127.0.0.1:8000/whatsapp/chat/)

### Notas Finales:
* **Nunca cierres las consolas negras** mientras estés usando el sistema.
* Recuerda que los números de teléfono deben tener el código de país sin el símbolo `+` (ejemplo: `593983706769`).
* ¡Cualquier archivo `.php` antiguo en la carpeta raíz ya no se usa y es obsoleto! Todo está enrutado a través de Django.
