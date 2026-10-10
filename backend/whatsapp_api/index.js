// Polyfill crypto para Node.js < 19 (requerido por Baileys)
if (typeof globalThis.crypto === 'undefined') {
    const { webcrypto } = require('crypto');
    globalThis.crypto = webcrypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.json({ limit: '600mb' }));
app.use(express.urlencoded({ limit: '600mb', extended: true }));
app.use(cors());

// ─── Seguridad: secreto compartido con Django ─────────────────────────
// Las rutas REST de este gateway (enviar mensajes, QR, cerrar sesión...)
// solo deben ser usadas por Django. Django manda la cabecera
// X-Internal-Token con el valor de INTERNAL_API_TOKEN; si no coincide,
// se rechaza la petición. Si la variable está vacía (desarrollo local),
// no se exige, para no romper el flujo de trabajo de siempre.
const { createHmac, timingSafeEqual } = require('crypto');
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN || '';
// Clave con la que Django firma los tickets del WebSocket. En desarrollo
// (sin INTERNAL_API_TOKEN) se usa una clave fija conocida: solo sirve para
// saber qué usuario abrió el WebSocket, no como protección.
const TICKET_KEY = INTERNAL_TOKEN || 'masssend-dev-insecure';

function safeEqual(a, b) {
    const A = Buffer.from(String(a)), B = Buffer.from(String(b));
    return A.length === B.length && timingSafeEqual(A, B);
}

if (!INTERNAL_TOKEN) {
    console.warn('[Seguridad] INTERNAL_API_TOKEN no definido: API y WebSocket SIN protección (solo para desarrollo local).');
}

app.use('/api', (req, res, next) => {
    if (!INTERNAL_TOKEN || safeEqual(req.get('X-Internal-Token') || '', INTERNAL_TOKEN)) return next();
    return res.status(401).json({ success: false, error: 'No autorizado' });
});

// Ticket del WebSocket: Django lo firma (HMAC-SHA256) para usuarios con
// sesión iniciada y dura 60 s. Formato: base64url(json).base64url(firma)
// Devuelve el id del usuario dueño del ticket, o null si no es válido.
function verifyWsTicket(ticket) {
    if (!ticket || !ticket.includes('.')) return null;
    const [payload, signature] = ticket.split('.');
    const expected = createHmac('sha256', TICKET_KEY).update(payload).digest('base64url');
    if (!safeEqual(signature, expected)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (typeof data.exp !== 'number' || data.exp * 1000 <= Date.now()) return null;
        return data.uid != null ? String(data.uid) : null;
    } catch { return null; }
}

// ─── Servidor HTTP + WebSocket (mismo puerto) ─────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({
    server,
    // Solo se aceptan conexiones con un ticket válido emitido por Django.
    // El ticket dice a qué usuario pertenece la conexión.
    verifyClient: (info) => {
        const url = new URL(info.req.url, 'http://localhost');
        const uid = verifyWsTicket(url.searchParams.get('ticket'));
        if (!uid) { console.warn('[WS] Conexión rechazada: ticket inválido o vencido'); return false; }
        info.req.uid = uid;
        return true;
    },
});

// Envía un evento SOLO a las pestañas abiertas del usuario indicado:
// cada usuario ve únicamente el estado y los mensajes de su propio número.
function sendToUser(uid, event, data) {
    const payload = JSON.stringify({ event, data, ts: Date.now() });
    wss.clients.forEach(client => {
        if (client.readyState === 1 && client.uid === String(uid)) client.send(payload);
    });
}

wss.on('connection', (ws, req) => {
    ws.uid = req.uid;
    const s = sessions.get(ws.uid);
    ws.send(JSON.stringify({
        event: 'status',
        data: {
            ready: Boolean(s && s.isReady),
            has_qr: Boolean(s && s.currentQR),
            has_pairing: Boolean(s && s.pairingCode),
        },
        ts: Date.now()
    }));
});

// ─── Sesiones de WhatsApp: UNA POR USUARIO ────────────────────────────
// Cada usuario del sistema vincula su propio número. Las credenciales de
// cada uno se guardan en auth_info_baileys/user_<id>/ y cada sesión tiene
// su propio QR, su propia cola de envío y su propio estado.
const AUTH_ROOT = './auth_info_baileys';
const MAX_SESSIONS = parseInt(process.env.MAX_WA_SESSIONS || '10', 10);
const QR_IDLE_MS = 3 * 60 * 1000; // sin vincular y sin nadie mirando el QR => se detiene
const sessions = new Map();       // uid -> sesión
let waVersion = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Número (solo dígitos) a partir de un JID clásico "5939...@s.whatsapp.net".
// Los JID "@lid" no contienen el número, así que devuelven ''.
function numeroDesdeJid(jid) {
    if (!jid || !jid.endsWith('@s.whatsapp.net')) return '';
    return jid.split('@')[0].split(':')[0];
}

// ID del mensaje -> número al que se envió (los últimos 5000), para poder
// informar el número en los avisos de entregado/leído que llegan con LID.
const sentIds = new Map();
function recordarEnvio(id, number) {
    if (!id) return;
    sentIds.set(id, number);
    if (sentIds.size > 5000) sentIds.delete(sentIds.keys().next().value);
}

// ID de mensaje con el mismo formato que usa WhatsApp Web ("3EB0" + hex).
function nuevoIdMensaje() {
    return '3EB0' + require('crypto').randomBytes(9).toString('hex').toUpperCase();
}
function authDir(uid) { return `${AUTH_ROOT}/user_${uid}`; }
// Un número está vinculado de verdad solo si WhatsApp aceptó el dispositivo
// ("account" en creds.json). Un intento de vinculación a medias deja un
// creds.json sin "account" que antes se tomaba como sesión válida.
function hasCreds(uid) {
    try {
        const c = JSON.parse(fs.readFileSync(`${authDir(uid)}/creds.json`, 'utf8'));
        return Boolean(c.account && c.me);
    } catch (_) {
        return false;
    }
}

// Borra las credenciales de un intento de vinculación que no terminó, para
// que el próximo arranque muestre un QR limpio.
function limpiarVinculacionIncompleta(uid) {
    const dir = authDir(uid);
    if (!fs.existsSync(`${dir}/creds.json`) || hasCreds(uid)) return;
    for (const f of fs.readdirSync(dir)) {
        try { fs.rmSync(`${dir}/${f}`, { recursive: true, force: true }); } catch (_) {}
    }
    console.log(`[WA ${uid}] Se descartó una vinculación incompleta.`);
}

function getSession(uid, create = false) {
    uid = String(uid);
    let s = sessions.get(uid);
    if (!s && create) {
        s = {
            uid, sock: null, isReady: false, currentQR: null,
            pairingCode: null, pairingPhone: null, reconnectTimer: null,
            queue: [], queueRunning: false, starting: false,
            stopped: false, lastInterest: Date.now(),
        };
        sessions.set(uid, s);
    }
    return s;
}

function activeSessionCount() {
    let n = 0;
    for (const s of sessions.values()) if (s.sock && !s.stopped) n++;
    return n;
}

// ─── Notificar a Django ───────────────────────────────────────────────
async function notifyDjango(path, body) {
    try {
        const djangoUrl = (process.env.DJANGO_API_URL || 'http://localhost:8000').replace(/\/$/, '');
        await fetch(`${djangoUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(INTERNAL_TOKEN ? { 'X-Internal-Token': INTERNAL_TOKEN } : {}) },
            body: JSON.stringify(body)
        });
    } catch (e) { /* Django no disponible */ }
}

function scheduleReconnect(s, delay = 5000) {
    if (s.reconnectTimer || s.stopped) return;
    s.reconnectTimer = setTimeout(async () => {
        s.reconnectTimer = null;
        await startSession(s.uid);
    }, delay);
}

// Detiene el socket de una sesión sin borrar sus credenciales.
function stopSession(s) {
    s.stopped = true;
    s.isReady = false;
    s.currentQR = null;
    if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
    try { if (s.sock) s.sock.end(new Error('Sesión detenida')); } catch (_) {}
    s.sock = null;
}

// ─── Crear / reiniciar la conexión de un usuario ──────────────────────
async function startSession(uid) {
    const s = getSession(uid, true);
    if (s.starting) return s;
    if (!s.sock && activeSessionCount() >= MAX_SESSIONS) {
        console.warn(`[WA ${uid}] Límite de ${MAX_SESSIONS} números conectados alcanzado.`);
        s.limitReached = true;
        return s;
    }
    s.limitReached = false;
    s.starting = true;
    s.stopped = false;

    if (s.sock) {
        try { s.sock.end(new Error('Reiniciando')); } catch (_) {}
        s.sock = null;
    }

    try {
        if (!waVersion) {
            try { waVersion = (await fetchLatestBaileysVersion()).version; } catch (_) {}
        }
        fs.mkdirSync(authDir(uid), { recursive: true });
        limpiarVinculacionIncompleta(uid);
        const { state, saveCreds } = await useMultiFileAuthState(authDir(uid));

        const sock = makeWASocket({
            ...(waVersion ? { version: waVersion } : {}),
            auth: state,
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: ['MassSend', 'Chrome', '120.0.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            retryRequestDelayMs: 2000,
        });
        s.sock = sock;

        sock.ev.on('connection.update', async (update) => {
            if (s.sock !== sock) return; // evento de un socket ya reemplazado
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                s.currentQR = qr;
                s.isReady = false;
                console.log(`[WA ${uid}] Nuevo código QR disponible`);
                sendToUser(uid, 'qr_update', { qr, ready: false });
            }

            if (connection === 'close') {
                s.isReady = false;
                const error = lastDisconnect?.error;
                const statusCode = (error instanceof Boom) ? error.output.statusCode : 0;
                console.log(`[WA ${uid}] Desconectado | código: ${statusCode} | motivo: ${error?.message || 'desconocido'}`);
                sendToUser(uid, 'qr_update', { ready: false });

                if (statusCode === DisconnectReason.loggedOut) {
                    // El usuario cerró la sesión desde su celular: borrar credenciales
                    try { fs.rmSync(authDir(uid), { recursive: true, force: true }); } catch (_) {}
                    s.currentQR = null;
                    if (Date.now() - s.lastInterest < QR_IDLE_MS) scheduleReconnect(s, 2000);
                    else stopSession(s);
                } else if (statusCode === DisconnectReason.connectionReplaced) {
                    // Otra sesión tomó el control: no reconectar
                } else if (hasCreds(uid) || Date.now() - s.lastInterest < QR_IDLE_MS) {
                    // Número ya vinculado (o alguien está mirando el QR): reintentar
                    scheduleReconnect(s, 5000);
                } else {
                    // Nadie escaneó el QR: detener para no gastar memoria
                    stopSession(s);
                }
            }

            if (connection === 'open') {
                s.isReady = true;
                s.currentQR = null;
                s.pairingCode = null;
                s.pairingPhone = null;
                console.log(`[WA ${uid}] Conectado.`);
                sendToUser(uid, 'wa_connected', { ready: true });
                processSendQueue(s);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // ─── Mensajes ENTRANTES → Django (con el dueño del número) ─────
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                if (msg.key.fromMe) continue;
                const jid = msg.key.remoteJid || '';
                if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;

                // Con LID el número real viene aparte, en senderPn
                const number = numeroDesdeJid(jid) || numeroDesdeJid(msg.key.senderPn || '');
                if (!number) continue;
                const body = msg.message?.conversation ||
                             msg.message?.extendedTextMessage?.text || '';
                if (!body) continue;

                await notifyDjango('/whatsapp/api/webhook/', { user_id: uid, from: number, body, type: 'chat' });
                sendToUser(uid, 'new_message', { from: number, body, direction: 'inbound' });
            }
        });

        // ─── ACK de mensajes SALIENTES → Django ───────────────────────
        // Escala de Baileys (proto.WebMessageInfo.Status):
        //   0 = error, 1 = pendiente, 2 = llegó al servidor de WhatsApp,
        //   3 = entregado al celular, 4 = leído, 5 = reproducido (audio/video).
        // WhatsApp ahora identifica muchos chats con "LID" (xxx@lid) en vez del
        // número (xxx@s.whatsapp.net). Por eso el aviso se relaciona con el
        // mensaje por su ID, y el número solo se usa como respaldo si viene.
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                if (!update.key?.fromMe || !update.key.id) continue;
                const jid = update.key.remoteJid || '';
                if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;

                const statusNum = update.update?.status;
                if (statusNum === undefined || statusNum === null) continue;

                const statusMap = { 0: 'failed', 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' };
                const status = statusMap[statusNum];
                if (!status) continue;

                const number = numeroDesdeJid(jid) || sentIds.get(update.key.id) || '';

                await notifyDjango('/whatsapp/api/message-ack/', {
                    user_id: uid, wpp_message_id: update.key.id, number, status
                });
                sendToUser(uid, 'message_ack', { wpp_message_id: update.key.id, number, status });
            }
        });

    } catch (err) {
        console.error(`[WA ${uid}] Error al iniciar:`, err.message);
        scheduleReconnect(s, 10000);
    } finally {
        s.starting = false;
    }
    return s;
}

// Al arrancar el gateway se reconectan los números que ya estaban vinculados.
function restoreSessions() {
    fs.mkdirSync(AUTH_ROOT, { recursive: true });

    // Migración: la versión anterior guardaba UNA sola sesión directamente en
    // auth_info_baileys/. Se mueve a la carpeta del usuario LEGACY_WA_USER_ID
    // (por defecto 1, normalmente el primer administrador).
    if (fs.existsSync(`${AUTH_ROOT}/creds.json`)) {
        const legacy = process.env.LEGACY_WA_USER_ID || '1';
        const dest = authDir(legacy);
        if (!fs.existsSync(`${dest}/creds.json`)) {
            fs.mkdirSync(dest, { recursive: true });
            for (const f of fs.readdirSync(AUTH_ROOT)) {
                if (f.startsWith('user_')) continue;
                try { fs.renameSync(`${AUTH_ROOT}/${f}`, `${dest}/${f}`); } catch (_) {}
            }
            console.log(`[WA] Sesión anterior migrada al usuario ${legacy}.`);
        }
    }

    for (const d of fs.readdirSync(AUTH_ROOT)) {
        const m = /^user_(\d+)$/.exec(d);
        if (m && hasCreds(m[1])) {
            console.log(`[WA] Restaurando número del usuario ${m[1]}...`);
            startSession(m[1]);
        }
    }
}

// ─── Cola de envío (una por usuario) ──────────────────────────────────
async function processSendQueue(s) {
    if (s.queueRunning) return;
    s.queueRunning = true;

    while (s.queue.length > 0) {
        if (!s.isReady || !s.sock) {
            // Sin conexión: se espera a que el número vuelva ('open' reanuda la cola)
            break;
        }
        const task = s.queue.shift();
        const { cleanNumber, message, media_base64, media_mimetype, media_filename, media_url } = task;
        const jid = `${cleanNumber}@s.whatsapp.net`;
        // Django manda el ID con el que ya guardó el mensaje: así los avisos de
        // entregado/leído se relacionan con su fila aunque lleguen antes que
        // el resultado del envío.
        const msgId = task.message_id || nuevoIdMensaje();
        recordarEnvio(msgId, cleanNumber);
        const send = (content) => s.sock.sendMessage(jid, content, { messageId: msgId });

        try {
            let msgResult;
            if (media_base64 && media_mimetype) {
                const buffer = Buffer.from(media_base64, 'base64');
                if (media_mimetype.startsWith('image/')) {
                    msgResult = await send({
                        image: buffer, caption: message || '',
                        mimetype: media_mimetype, fileName: media_filename || 'image'
                    });
                } else if (media_mimetype.startsWith('video/')) {
                    msgResult = await send({
                        video: buffer, caption: message || '',
                        mimetype: media_mimetype, fileName: media_filename || 'video'
                    });
                } else {
                    msgResult = await send({
                        document: buffer, caption: message || '',
                        mimetype: media_mimetype, fileName: media_filename || 'archivo'
                    });
                }
            } else if (media_url) {
                const resp = await fetch(media_url);
                if (!resp.ok) throw new Error(`No se pudo descargar el media (${resp.status}): ${media_url}`);
                const buffer = Buffer.from(await resp.arrayBuffer());
                const mime = resp.headers.get('content-type') || 'application/octet-stream';
                if (mime.startsWith('image/')) {
                    msgResult = await send({ image: buffer, caption: message || '', mimetype: mime });
                } else if (mime.startsWith('video/')) {
                    msgResult = await send({ video: buffer, caption: message || '', mimetype: mime });
                } else {
                    msgResult = await send({
                        document: buffer, caption: message || '',
                        mimetype: mime, fileName: media_url.split('/').pop() || 'archivo'
                    });
                }
            } else {
                msgResult = await send({ text: message });
            }

            const wppId = msgResult?.key?.id || msgId;
            console.log(`[WA ${s.uid}] ✓ Enviado a ${cleanNumber}`);
            await notifyDjango('/whatsapp/api/send-result/', {
                user_id: s.uid, number: cleanNumber, status: 'sent', wpp_message_id: wppId
            });
            sendToUser(s.uid, 'campaign_msg_sent', { number: cleanNumber, status: 'sent', wpp_message_id: wppId });
        } catch (err) {
            const errorMsg = err.message || String(err);
            console.error(`[WA ${s.uid}] ✗ Error enviando a ${cleanNumber}:`, errorMsg);
            await notifyDjango('/whatsapp/api/send-result/', {
                user_id: s.uid, number: cleanNumber, status: 'failed', error: errorMsg,
                wpp_message_id: msgId
            });
        }

        if (s.queue.length > 0) await sleep(2000);
    }

    s.queueRunning = false;
}

// ─── Endpoints (todos reciben user_id desde Django) ───────────────────
function userIdFrom(req) {
    const uid = (req.body && req.body.user_id) ?? req.query.user_id;
    return uid == null || uid === '' ? null : String(uid);
}

function requireUser(req, res) {
    const uid = userIdFrom(req);
    if (!uid) { res.status(400).json({ success: false, error: 'Falta user_id' }); return null; }
    return uid;
}

app.post('/api/send', (req, res) => {
    const uid = requireUser(req, res); if (!uid) return;
    const s = getSession(uid);
    if (!s || !s.isReady) {
        return res.status(503).json({ success: false, error: 'Tu WhatsApp no está conectado. Escanea el QR.' });
    }
    const { number, message, media_url, media_base64, media_mimetype, media_filename } = req.body;
    // ID opcional generado por Django (solo letras/números, como los de WhatsApp)
    const message_id = /^[A-Za-z0-9]{8,64}$/.test(req.body.message_id || '') ? req.body.message_id : null;
    if (!number || !message) {
        return res.status(400).json({ success: false, error: 'Faltan parametros: number y message son requeridos.' });
    }
    const cleanNumber = String(number).replace(/[^0-9]/g, '');
    s.queue.push({ cleanNumber, message, media_url, media_base64, media_mimetype, media_filename, message_id });
    res.json({ success: true, status: 'queued', queue_size: s.queue.length });
    processSendQueue(s);
});

app.get('/api/status', (req, res) => {
    const uid = requireUser(req, res); if (!uid) return;
    const s = getSession(uid);
    res.json({ ready: Boolean(s && s.isReady) });
});

// Pedir el QR también "despierta" la sesión del usuario si no estaba activa.
app.get('/api/qr', async (req, res) => {
    const uid = requireUser(req, res); if (!uid) return;
    let s = getSession(uid, true);
    s.lastInterest = Date.now();
    if (!s.sock && !s.starting) s = await startSession(uid);
    res.json({
        ready: s.isReady,
        has_qr: s.currentQR !== null,
        qr: s.currentQR,
        has_pairing: s.pairingCode !== null,
        pairing_code: s.pairingCode,
        pairing_phone: s.pairingPhone,
        limit_reached: Boolean(s.limitReached),
        ...(s.limitReached ? { error: `El servidor alcanzó el máximo de ${MAX_SESSIONS} números conectados.` } : {}),
    });
});

// Vincular con código de teléfono quedó desactivado: si el intento fallaba,
// el número quedaba guardado y el QR ya no volvía a aparecer. Se vincula solo
// con QR (cualquier celular con WhatsApp puede escanearlo).
app.post('/api/request-pairing', (req, res) => {
    res.status(410).json({ success: false, error: 'La vinculación por código está desactivada. Usa el código QR.' });
});

app.post('/api/logout', async (req, res) => {
    const uid = requireUser(req, res); if (!uid) return;
    const s = getSession(uid, true);
    res.json({ success: true, message: 'Desconectando...' });
    try { if (s.sock) await s.sock.logout(); } catch (_) {}
    stopSession(s);
    s.queue = [];
    s.pairingCode = null;
    s.pairingPhone = null;
    // Borrar el CONTENIDO de la carpeta del usuario (invalida la sesión)
    try {
        for (const f of fs.readdirSync(authDir(uid))) {
            try { fs.rmSync(`${authDir(uid)}/${f}`, { recursive: true, force: true }); } catch (_) {}
        }
    } catch (_) {}
    sendToUser(uid, 'qr_update', { ready: false });
    // Generar un QR nuevo para vincular otro número
    s.lastInterest = Date.now();
    setTimeout(() => startSession(uid), 2000);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[WhatsApp] API REST + WebSocket en http://0.0.0.0:${PORT} (multi-número, máx. ${MAX_SESSIONS})`);
    restoreSessions();
});
