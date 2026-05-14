const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '600mb' }));
app.use(express.urlencoded({ limit: '600mb', extended: true }));
app.use(cors());

// ─── Estado global ────────────────────────────────────────────────────
let isReady = false;
let currentQR = null;
let pairingCode = null;
let pairingPhone = null;
let sock = null;
let reconnecting = false;

// ─── Cola de envío ────────────────────────────────────────────────────
const sendQueue = [];
let queueRunning = false;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Notificar a Django ───────────────────────────────────────────────
async function notifyDjango(path, body) {
    try {
        const djangoUrl = (process.env.DJANGO_API_URL || 'http://localhost:8000').replace(/\/$/, '');
        await fetch(`${djangoUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) { /* Django no disponible */ }
}

// ─── Crear cliente WhatsApp (Baileys) ─────────────────────────────────
async function createClient() {
    if (reconnecting) return;
    reconnecting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

        const newSock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
        });

        // ─── Eventos de conexión ──────────────────────────────────────
        newSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQR = qr;
                pairingCode = null;
                isReady = false;
                console.log('====================================================');
                console.log('ESCANEA ESTE CODIGO QR CON TU WHATSAPP');
                console.log('====================================================');
                qrcode.generate(qr, { small: true });

                // Si hay número pendiente para código de vinculación
                if (pairingPhone) {
                    try {
                        console.log(`[WhatsApp] Solicitando código de vinculación para ${pairingPhone}...`);
                        const code = await newSock.requestPairingCode(pairingPhone);
                        pairingCode = code;
                        currentQR = null;
                        console.log(`[WhatsApp] Código de vinculación: ${code}`);
                    } catch (e) {
                        console.error('[WhatsApp] Error al pedir código:', e.message);
                        pairingPhone = null;
                    }
                }
            }

            if (connection === 'close') {
                isReady = false;
                reconnecting = false;
                const statusCode = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output.statusCode
                    : 0;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    console.log('[WhatsApp] Desconectado. Reconectando en 5s...');
                    setTimeout(createClient, 5000);
                } else {
                    console.log('[WhatsApp] Sesión cerrada (logout). Esperando nuevo QR...');
                    setTimeout(createClient, 2000);
                }
            }

            if (connection === 'open') {
                isReady = true;
                currentQR = null;
                pairingCode = null;
                pairingPhone = null;
                reconnecting = false;
                console.log('[WhatsApp] Conectado exitosamente. Sistema listo.');
            }
        });

        newSock.ev.on('creds.update', saveCreds);

        // ─── Mensajes ENTRANTES → Django ──────────────────────────────
        newSock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                if (msg.key.fromMe) continue;
                const jid = msg.key.remoteJid || '';
                if (!jid.endsWith('@s.whatsapp.net')) continue; // solo individuales

                const number = jid.replace('@s.whatsapp.net', '');
                const body = msg.message?.conversation ||
                             msg.message?.extendedTextMessage?.text || '';
                if (!body) continue;

                console.log(`[WhatsApp] Mensaje entrante de ${number}: ${body.substring(0, 60)}`);
                await notifyDjango('/whatsapp/api/webhook/', { from: number, body, type: 'chat' });
            }
        });

        // ─── ACK de mensajes SALIENTES → Django ───────────────────────
        newSock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                if (!update.key?.fromMe) continue;
                const jid = update.key.remoteJid || '';
                if (!jid.endsWith('@s.whatsapp.net')) continue;

                const number = jid.replace('@s.whatsapp.net', '');
                const statusNum = update.update?.status;
                if (!statusNum) continue;

                // Baileys: 1=enviado al servidor, 2=entregado, 3=leído, 4=reproducido
                const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read' };
                const status = statusMap[statusNum];
                if (!status) continue;

                await notifyDjango('/whatsapp/api/message-ack/', {
                    wpp_message_id: update.key.id || null,
                    number,
                    status,
                    ack: statusNum
                });
            }
        });

        sock = newSock;
    } catch (err) {
        reconnecting = false;
        console.error('[WhatsApp] Error creando cliente:', err.message);
        setTimeout(createClient, 10000);
    }
}

// ─── Inicializar ──────────────────────────────────────────────────────
createClient();

// ─── Procesador de cola ───────────────────────────────────────────────
async function processSendQueue() {
    if (queueRunning) return;
    queueRunning = true;
    console.log('[Queue] Iniciando procesamiento de cola...');

    while (sendQueue.length > 0) {
        const task = sendQueue.shift();
        const { cleanNumber, message, media_base64, media_mimetype, media_filename, media_url } = task;

        if (!isReady || !sock) {
            console.log(`[Queue] WhatsApp no listo. Esperando 5s antes de reintentar ${cleanNumber}...`);
            sendQueue.unshift(task);
            await sleep(5000);
            continue;
        }

        const jid = `${cleanNumber}@s.whatsapp.net`;

        try {
            let msgResult;

            if (media_base64 && media_mimetype) {
                const buffer = Buffer.from(media_base64, 'base64');
                if (media_mimetype.startsWith('image/')) {
                    msgResult = await sock.sendMessage(jid, {
                        image: buffer, caption: message || '',
                        mimetype: media_mimetype, fileName: media_filename || 'image'
                    });
                } else if (media_mimetype.startsWith('video/')) {
                    msgResult = await sock.sendMessage(jid, {
                        video: buffer, caption: message || '',
                        mimetype: media_mimetype, fileName: media_filename || 'video'
                    });
                } else {
                    msgResult = await sock.sendMessage(jid, {
                        document: buffer, caption: message || '',
                        mimetype: media_mimetype, fileName: media_filename || 'archivo'
                    });
                }
            } else if (media_url) {
                const resp = await fetch(media_url);
                const buffer = Buffer.from(await resp.arrayBuffer());
                const mime = resp.headers.get('content-type') || 'application/octet-stream';
                if (mime.startsWith('image/')) {
                    msgResult = await sock.sendMessage(jid, { image: buffer, caption: message || '', mimetype: mime });
                } else {
                    msgResult = await sock.sendMessage(jid, { document: buffer, caption: message || '', mimetype: mime });
                }
            } else {
                msgResult = await sock.sendMessage(jid, { text: message });
            }

            const wppId = msgResult?.key?.id || null;
            console.log(`[Queue] ✓ Enviado a ${cleanNumber} | id=${wppId}`);

            await notifyDjango('/whatsapp/api/send-result/', {
                number: cleanNumber, status: 'sent', wpp_message_id: wppId
            });

        } catch (err) {
            const errorMsg = err.message || String(err);
            console.error(`[Queue] ✗ Error enviando a ${cleanNumber}:`, errorMsg);

            await notifyDjango('/whatsapp/api/send-result/', {
                number: cleanNumber, status: 'failed', error: errorMsg
            });
        }

        if (sendQueue.length > 0) {
            await sleep(2000); // 2s entre mensajes
        }
    }

    queueRunning = false;
    console.log('[Queue] Cola vaciada.');
}

// ─── Endpoints ────────────────────────────────────────────────────────

app.post('/api/send', (req, res) => {
    if (!isReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp no conectado. Escanea el QR.' });
    }
    const { number, message, media_url, media_base64, media_mimetype, media_filename } = req.body;
    if (!number || !message) {
        return res.status(400).json({ success: false, error: 'Faltan parametros: number y message son requeridos.' });
    }
    const cleanNumber = number.replace(/[^0-9]/g, '');
    sendQueue.push({ cleanNumber, message, media_url, media_base64, media_mimetype, media_filename });
    res.json({ success: true, status: 'queued', queue_size: sendQueue.length });
    processSendQueue();
});

app.get('/api/status', (req, res) => {
    res.json({ ready: isReady });
});

app.get('/api/qr', (req, res) => {
    res.json({
        ready: isReady,
        has_qr: currentQR !== null,
        qr: currentQR,
        has_pairing: pairingCode !== null,
        pairing_code: pairingCode,
        pairing_phone: pairingPhone
    });
});

app.post('/api/request-pairing', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Falta el numero de telefono' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 7) return res.status(400).json({ success: false, error: 'Numero invalido' });
    if (isReady) return res.status(400).json({ success: false, error: 'Ya hay un numero conectado.' });

    pairingPhone = cleanPhone;
    pairingCode = null;

    if (sock) {
        try {
            console.log(`[WhatsApp] Solicitando código de vinculación para ${cleanPhone}...`);
            const code = await sock.requestPairingCode(cleanPhone);
            pairingCode = code;
            currentQR = null;
            console.log(`[WhatsApp] Código obtenido: ${code}`);
            return res.json({ success: true, code });
        } catch (e) {
            pairingPhone = null;
            return res.status(500).json({ success: false, error: 'No se pudo obtener el código: ' + e.message });
        }
    }

    res.json({ success: true, message: 'Numero guardado. El codigo aparecera cuando el cliente inicie.' });
});

app.post('/api/logout', async (req, res) => {
    try {
        isReady = false;
        currentQR = null;
        pairingCode = null;
        pairingPhone = null;
        reconnecting = false;

        res.json({ success: true, message: 'Desconectando...' });

        try {
            if (sock) await sock.logout();
        } catch (e) {
            console.log('[WhatsApp] Error en logout:', e.message);
        }

        // Eliminar archivos de sesión para limpiar completamente
        try { fs.rmSync('./auth_info_baileys', { recursive: true, force: true }); } catch (_) {}

        setTimeout(createClient, 2000);
    } catch (err) {
        console.error('[WhatsApp] Error en logout:', err.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WhatsApp] API corriendo en http://0.0.0.0:${PORT}`);
    console.log(`[WhatsApp] Iniciando WhatsApp (Baileys)... espera unos segundos.`);
});
