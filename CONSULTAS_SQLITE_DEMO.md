# Consultas SQLite para mostrar en la demo — MassSend

## Cómo abrir la base de datos

**Opción A — desde el clúster (recomendada, muestra la BD real en uso):**
```powershell
docker exec -it masssend-backend python manage.py dbshell
```
Te deja en el prompt de SQLite (`sqlite>`). Pega cualquier consulta de abajo y `Enter`. Para salir: `.quit`

**Opción B — con una app gráfica (más vistoso para proyectar):**
Descarga [DB Browser for SQLite](https://sqlitebrowser.org/) y abre el archivo `backend/db.sqlite3` (o cópialo del volumen `masssend_db` si estás en modo Swarm).

---

## 1. Ver todas las tablas del sistema (evidencia de "instancia única de BD")

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
```
*Muestra de un vistazo que TODO el sistema (usuarios, campañas, pagos, correos) vive en una sola base de datos, administrada por el único backend.*

---

## 2. Usuarios y roles (is_staff = admin)

```sql
SELECT id, username, email, is_staff, is_active, date_joined
FROM auth_user
ORDER BY date_joined DESC;
```
*Aquí se ve la columna `is_staff`: el valor real que decide quién ve el menú de administrador.*

---

## 3. Campañas con su estado y archivo (evidencia de PocketBase)

```sql
SELECT id, name, status, media_url, media_file, target_tags, created_at
FROM campaigns
ORDER BY created_at DESC
LIMIT 10;
```
*Si `media_url` empieza con tu URL de PocketBase, es evidencia de que el archivo NO está en disco local (columna `media_file` vacía).*

---

## 4. Progreso de una campaña (para explicar la cola asíncrona)

```sql
SELECT campaign_id, total, sent, failed, is_running
FROM campaign_progress
ORDER BY campaign_id DESC;
```
*`sent` y `failed` van subiendo en vivo mientras el consumidor de Node procesa la cola — puedes correr esta consulta dos veces seguidas durante el envío y mostrar cómo cambian los números.*

---

## 5. Mensajes enviados y su estado

```sql
SELECT id, contact_id, campaign_id, status, wpp_message_id, sent_at
FROM messages
ORDER BY sent_at DESC
LIMIT 15;
```

---

## 6. Cola de correos (productor-consumidor con estados)

```sql
SELECT task_type, recipient, status, attempts, created_at, updated_at
FROM email_auth_email_task
ORDER BY created_at DESC
LIMIT 15;
```
*Aquí se ve el ciclo `PENDING → PROCESSING → SENT/FAILED` que arma el worker `process_email_queue`. Perfecta para explicar la cola asíncrona de correos.*

```sql
-- Cuántas tareas hay en cada estado (para "demostrar" la cola vaciándose)
SELECT status, COUNT(*) AS cantidad
FROM email_auth_email_task
GROUP BY status;
```

---

## 7. Control de pausa de la cola de correos

```sql
SELECT * FROM email_auth_queue_control;
```

---

## 8. Créditos y billetera del usuario

```sql
SELECT user_id, balance, updated_at
FROM billing_credit_wallet
ORDER BY updated_at DESC;
```

---

## 9. Transacciones de pago (PayPal/PayPhone sandbox) — la más importante para tu defensa

```sql
SELECT id, user_id, provider, provider_reference, amount, status, created_at
FROM billing_payment_transaction
ORDER BY created_at DESC
LIMIT 10;
```
*Muestra los estados `pending / approved / cancelled / failed` que exige la rúbrica, con la referencia real que devolvió la pasarela.*

---

## 10. Historial de gasto de créditos (auditoría de consumo)

```sql
SELECT wallet_id, campaign_id, amount, created_at
FROM billing_credit_spend
ORDER BY created_at DESC
LIMIT 10;
```

---

## 11. Perfiles de seguridad (TOTP activado, quién tiene 2FA)

```sql
SELECT user_id, status, updated_at
FROM email_auth_securityprofile;
```

---

## 12. Consulta "combinada" para impresionar (join de usuario + créditos + campañas)

```sql
SELECT
  u.username,
  u.is_staff,
  w.balance AS creditos,
  COUNT(c.id) AS total_campanas
FROM auth_user u
LEFT JOIN billing_credit_wallet w ON w.user_id = u.id
LEFT JOIN campaigns c ON 1=1
GROUP BY u.id
ORDER BY u.date_joined DESC;
```
*Esta demuestra que sabes hacer JOIN, no solo SELECT — buen punto extra de dominio técnico si te preguntan por la base de datos.*

---

## Frase para acompañar esta parte de la demo

> "Toda la información del sistema —usuarios, campañas, mensajes, pagos, cola de correos— vive en esta única base de datos SQLite, montada en el volumen `masssend_db`. Es la única instancia de base de datos del clúster: las 3 réplicas del frontend y el backend siempre leen y escriben aquí, lo que garantiza que los datos sean consistentes sin importar qué réplica atendió la solicitud."
