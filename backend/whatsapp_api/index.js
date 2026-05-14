const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '600mb' }));
app.use(express.urlencoded({ limit: '600mb', extended: true }));
app.use(cors());

// ─── Estado global ───────────────────────────────────────────────────
let isReady = false;
let currentQR = null;   // QR string actual
let pairingCode = null;   // Código de vinculación por teléfono
let pairingPhone = null;   // Número para el que se pidió el código
let client;                // Se declara aquí para poder recrearlo

// ─── Crear cliente WhatsApp ───────────────────────────────────────────
function createClient() {
    const c = new Client({
        authStrategy: new LocalAuth(),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014111620-alpha.html',
        },
        puppeteer: {
            headless: true,
            protocolTimeout: 120000,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
        }
    });

    c.on('qr', async (qr) => {
        currentQR = qr;
        pairingCode = null;
        console.log('====================================================');
        console.log('ESCANEA ESTE CODIGO QR CON TU WHATSAPP');
        console.log('====================================================');
        qrcode.generate(qr, { small: true });

        // Si hay un número pendiente para código de vinculación, pedirlo
        if (pairingPhone) {
            try {
                console.log(`[WhatsApp] Solicitando código de vinculación para ${pairingPhone}...`);
                const code = await c.requestPairingCode(pairingPhone);
                pairingCode = code;
                currentQR = null;  // modo código, no QR
                console.log(`[WhatsApp] Código de vinculación: ${code}`);
            } catch (e) {
                console.error('[WhatsApp] Error al pedir código de vinculación:', e.message);
                pairingCode = null;
                pairingPhone = null;
            }
        }
    });

    c.on('ready', () => {
        isReady = true;
        currentQR = null;
        pairingCode = null;
        pairingPhone = null;
        console.log('[WhatsApp] Conectado exitosamente. Sistema listo.');
    });

    c.on('auth_failure', msg => {
        console.error('[WhatsApp] Fallo de autenticacion:', msg);
        isReady = false;
    });

    c.on('disconnected', (reason) => {
        console.log('[WhatsApp] Desconectado:', reason);
        isReady = false;
        pairingCode = null;
        pairingPhone = null;
        // NO limpiar currentQR aquí — mantener el último QR visible
        // para que el admin pueda mostrarlo mientras el cliente reinicia.
        // Se limpiará justo antes de que el nuevo cliente arranque.

        console.log('[WhatsApp] Re-inicializando cliente en 5 segundos...');
        setTimeout(() => {
            console.log('[WhatsApp] Re-inicializando cliente...');
            currentQR = null; // limpiar QR justo antes del reinicio
            try { client.destroy(); } catch (_) {}
            client = createClient();
            client.initialize();
        }, 5000);
    });

    // ─── Mensajes ENTRANTES → guardar en Django ───────────────────────
    c.on('message', async msg => {
        if (msg.from === 'status@broadcast') return;
        if (msg.from.endsWith('@g.us')) return;
        if (msg.from.endsWith('@newsletter')) return;
        if (msg.from.endsWith('@lid')) return;

        const number = msg.from.replace('@c.us', '');
        console.log(`[WhatsApp] Mensaje entrante de ${number}: ${msg.body.substring(0, 60)}`);

        try {
            const djangoUrl = process.env.DJANGO_API_URL || 'http://localhost:8000';
            await fetch(`${djangoUrl}/whatsapp/api/webhook/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: number, body: msg.body, type: msg.type })
            });
        } catch (e) {
            console.log('[WhatsApp] Django no disponible. Mensaje no guardado en DB.');
        }
    });

    // ─── ACK de mensajes SALIENTES → actualizar estado en Django ──────
    c.on('message_ack', async (msg, ack) => {
        const statusMap = { 0: 'failed', 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read' };
        const status = statusMap[ack] || 'sent';

        if (!msg.to || !msg.to.endsWith('@c.us')) return;
        const number = msg.to.replace('@c.us', '');

        console.log(`[WhatsApp] ACK para ${number}: ${status} (ack=${ack})`);

        try {
            const djangoUrl = process.env.DJANGO_API_URL || 'http://localhost:8000';
            await fetch(`${djangoUrl}/whatsapp/api/message-ack/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wpp_message_id: msg.id ? msg.id._serialized : null,
                    number: number,
                    status: status,
                    ack: ack
                })
            });
        } catch (e) { /* Django no disponible */ }
    });

    return c;
}

// ─── Inicializar ──────────────────────────────────────────────────────
client = createClient();
client.initialize();

// ─── Cola de envío asíncrono ──────────────────────────────────────────
// Responde a Django de inmediato (sin bloquear) y procesa los mensajes
// en background uno por uno con pausa entre ellos.
const sendQueue = [];
let queueRunning = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processSendQueue() {
    if (queueRunning) return;
    queueRunning = true;
    console.log('[Queue] Iniciando procesamiento de cola...');

    while (sendQueue.length > 0) {
        const task = sendQueue.shift();
        const { cleanNumber, formattedNumber, message, media_base64, media_mimetype,
                media_filename, media_url } = task;

        if (!isReady) {
            console.log(`[Queue] WhatsApp no listo. Esperando 5s antes de reintentar ${cleanNumber}...`);
            sendQueue.unshift(task); // devolver al frente de la cola
            await sleep(5000);
            continue;
        }

        try {
            let sentMsg;
            if (media_base64 && media_mimetype) {
                const media = new MessageMedia(media_mimetype, media_base64, media_filename || 'archivo');
                sentMsg = await client.sendMessage(formattedNumber, media, { caption: message });
            } else if (media_url) {
                const media = await MessageMedia.fromUrl(media_url, { unsafeMime: true });
                sentMsg = await client.sendMessage(formattedNumber, media, { caption: message });
            } else {
                sentMsg = await client.sendMessage(formattedNumber, message);
            }
            const wppId = sentMsg && sentMsg.id ? sentMsg.id._serialized : null;
            console.log(`[Queue] ✓ Enviado a ${cleanNumber} | id=${wppId}`);

            // Notificar a Django: envío exitoso
            try {
                const djangoUrl = process.env.DJANGO_API_URL || 'http://localhost:8000';
                await fetch(`${djangoUrl}/whatsapp/api/send-result/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: cleanNumber, status: 'sent', wpp_message_id: wppId })
                });
            } catch (e) { /* Django no disponible */ }

        } catch (err) {
            const errorMsg = err.message || String(err);
            const isDetachedFrame = errorMsg.includes('detached Frame') || errorMsg.includes('detached');
            const isInvalid = errorMsg === 't: t' || errorMsg.includes('t: t');

            if (isInvalid) {
                console.log(`[Queue] Numero invalido: ${cleanNumber}`);
                try {
                    const djangoUrl = process.env.DJANGO_API_URL || 'http://localhost:8000';
                    await fetch(`${djangoUrl}/whatsapp/api/send-result/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: cleanNumber, status: 'failed', error: 'Numero invalido' })
                    });
                } catch (e) { /* Django no disponible */ }
            } else if (isDetachedFrame) {
                console.error(`[Queue] Frame detachado enviando a ${cleanNumber}. Reiniciando cliente...`);
                isReady = false;
                sendQueue.unshift(task); // reintentar después del reinicio
                setTimeout(() => {
                    currentQR = null;
                    try { client.destroy(); } catch (_) {}
                    client = createClient();
                    client.initialize();
                }, 3000);
                await sleep(15000); // esperar reinicio completo
                continue;
            } else {
                console.error(`[Queue] Error enviando a ${cleanNumber}:`, errorMsg);
                // Notificar a Django: envío fallido
                try {
                    const djangoUrl = process.env.DJANGO_API_URL || 'http://localhost:8000';
                    await fetch(`${djangoUrl}/whatsapp/api/send-result/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number: cleanNumber, status: 'failed', error: errorMsg })
                    });
                } catch (e) { /* Django no disponible */ }
            }
        }

        // Pausa entre mensajes para no saturar WhatsApp
        if (sendQueue.length > 0) {
            await sleep(3000);
        }
    }

    queueRunning = false;
    console.log('[Queue] Cola vaciada.');
}

// ─── Endpoint: Enviar mensaje (responde inmediatamente) ───────────────
app.post('/api/send', (req, res) => {
    if (!isReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp no conectado. Escanea el QR.' });
    }

    const { number, message, media_url, media_base64, media_mimetype, media_filename } = req.body;

    if (!number || !message) {
        return res.status(400).json({ success: false, error: 'Faltan parametros: number y message son requeridos.' });
    }

    const cleanNumber = number.replace(/[^0-9]/g, '');
    const formattedNumber = `${cleanNumber}@c.us`;

    // Encolar el mensaje y responder inmediatamente a Django
    sendQueue.push({ cleanNumber, formattedNumber, message, media_url,
                     media_base64, media_mimetype, media_filename });

    res.json({ success: true, status: 'queued', queue_size: sendQueue.length });

    // Arrancar el procesador de cola si no está corriendo
    processSendQueue();
});

// ─── Endpoint: Estado del servidor ───────────────────────────────────
app.get('/api/status', (req, res) => {
    res.json({ ready: isReady });
});

// ─── Endpoint: QR / estado de conexión ───────────────────────────────
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

// ─── Endpoint: Solicitar código de vinculación por teléfono ──────────
app.post('/api/request-pairing', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, error: 'Falta el numero de telefono' });
    }

    // Normalizar: solo dígitos, sin +
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 7) {
        return res.status(400).json({ success: false, error: 'Numero de telefono invalido' });
    }

    if (isReady) {
        return res.status(400).json({ success: false, error: 'Ya hay un numero conectado. Desconecta primero.' });
    }

    pairingPhone = cleanPhone;
    pairingCode = null;

    // Si ya hay un QR activo, solicitar el código de vinculación inmediatamente
    if (currentQR) {
        try {
            console.log(`[WhatsApp] Solicitando código de vinculación para ${cleanPhone}...`);
            const code = await client.requestPairingCode(cleanPhone);
            pairingCode = code;
            currentQR = null;
            console.log(`[WhatsApp] Código obtenido: ${code}`);
            return res.json({ success: true, code: code });
        } catch (e) {
            pairingPhone = null;
            return res.status(500).json({ success: false, error: 'No se pudo obtener el código: ' + e.message });
        }
    }

    res.json({ success: true, message: 'Numero guardado. El codigo aparecera cuando el cliente inicie.' });
});

// ─── Endpoint: Cerrar sesión / cambiar número ─────────────────────────
app.post('/api/logout', async (req, res) => {
    try {
        isReady = false;
        currentQR = null;
        pairingCode = null;
        pairingPhone = null;

        // Responder primero para no bloquear al cliente
        res.json({ success: true, message: 'Desconectando...' });

        // Cerrar sesión (el evento 'disconnected' con razón LOGOUT se encargará de reinicializar)
        try {
            await client.logout();
        } catch (e) {
            console.log('[WhatsApp] Error en logout (forzando reinicio):', e.message);
            // Forzar recreación del cliente si logout falla
            setTimeout(async () => {
                try { await client.destroy(); } catch (_) { }
                client = createClient();
                client.initialize();
            }, 2000);
        }

    } catch (err) {
        console.error('[WhatsApp] Error crítico en logout:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WhatsApp] API corriendo en http://0.0.0.0:${PORT}`);
    console.log(`[WhatsApp] Iniciando WhatsApp Web... espera unos segundos.`);
});
