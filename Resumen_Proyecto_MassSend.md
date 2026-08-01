# MassSend — Resumen del proyecto

## ¿Qué es?

MassSend es una plataforma web para enviar mensajes masivos de WhatsApp a una lista de contactos, con autenticación segura, control de roles (administrador vs. usuario normal) y un sistema de créditos con pago real (PayPal y PayPhone) para poder monetizar el envío de campañas.

## Arquitectura técnica

El proyecto tiene tres partes que corren por separado:

- **Backend (Django + Django REST Framework):** toda la lógica de negocio, base de datos, autenticación y la API que consume el frontend.
- **Frontend (React + Vite):** la interfaz que usa el usuario en el navegador.
- **WhatsApp API (Node.js):** un servicio aparte que mantiene la conexión con WhatsApp Web (vía código QR) y es el que realmente envía los mensajes.

El backend está organizado en apps de Django, cada una con una responsabilidad clara (principios SOLID): `mass_sender` (contactos, campañas, chat, reportes — el núcleo original), `email_auth` (verificación de correo, MFA, recuperación de contraseña) y `billing` (créditos y pasarelas de pago). Dentro de cada app, el código se divide en capas: modelos → repositorios (acceso a datos) → servicios (reglas de negocio) → vistas (HTTP), para que cada pieza se pueda cambiar sin romper las demás.

## Módulo 1 — Mensajería masiva (el núcleo original)

- Importar contactos desde CSV, organizarlos con etiquetas.
- Crear campañas: una plantilla de mensaje (con variables tipo `{{nombre}}`), imagen/video opcional, y un filtro de a quién le llega.
- Ejecutar la campaña: se conecta con el servicio de Node para mandar los mensajes uno por uno a los contactos filtrados, sin bloquear la app (corre en segundo plano).
- Chat en tiempo real y reportes de entregas/lecturas/fallos por campaña.
- Conexión a WhatsApp propia por cada cuenta, escaneando un QR.

## Módulo 2 — Autenticación y seguridad

- **Registro con verificación por correo:** al crear cuenta, llega un código al Gmail configurado; sin verificarlo no se activa la cuenta.
- **Login con Google** (OAuth2) como alternativa al registro manual.
- **MFA / verificación en dos pasos (2FA):** cualquier usuario puede activar un código TOTP (tipo Google Authenticator) desde "Seguridad". Si está activo, se exige el código también al entrar por Google (antes esto se podía saltar — quedó corregido).
- **Recuperación de contraseña** por correo con token temporal.
- **Roles:** el flag `is_staff` de Django decide si una cuenta es administrador (ve todo el menú, incluida la cola de correos) o usuario normal (ve solo lo operativo). No depende de ningún correo hardcodeado.
- Todos los correos (verificación, recuperación, notificaciones) se procesan por una cola en segundo plano, no de forma instantánea/bloqueante.

## Módulo 3 — Créditos y pagos

- **Modelo de negocio:** créditos, no suscripción. 1 crédito = 1 mensaje enviado en una campaña.
- Toda cuenta nueva recibe **10 créditos gratis** al crearse, para probar el sistema antes de decidir comprar más.
- Al ejecutar una campaña se descuentan créditos según la cantidad de contactos; si no alcanza el saldo, se bloquea con un aviso claro. Los administradores no consumen créditos.
- **Compra de créditos** con dos pasarelas activas: **PayPal** y **PayPhone** (ambas en modo sandbox/pruebas). El usuario elige un paquete, paga, y al volver de la pasarela el sistema confirma el pago contra la API real del proveedor antes de acreditar los créditos (nunca se confía solo en lo que diga el navegador).
- Historial de compras y saldo visibles en la página "Créditos".

## Flujo típico de un usuario

1. Se registra (o entra con Google) y verifica su correo.
2. Activa 2FA si quiere más seguridad.
3. Importa sus contactos y crea una campaña.
4. Prueba con los 10 créditos gratis.
5. Si necesita más, compra un paquete con PayPal o PayPhone.
6. Ejecuta la campaña; el sistema descuenta los créditos y envía por WhatsApp.

## En una frase

MassSend es un mini-SaaS de envío masivo de WhatsApp: mensajería + seguridad de cuenta de nivel real (2FA, verificación de correo) + un modelo de monetización por créditos con pagos reales, todo separado en capas para que cada parte se pueda mantener o ampliar sin tocar las demás.
