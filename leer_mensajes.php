<?php
session_start();
header('Content-Type: application/json');


$objSql = new cSql;

// ============================================
// RECIBIR TIMESTAMP DEL CLIENTE
// ============================================
$lastUpdate = isset($_GET['last_update']) ? intval($_GET['last_update']) : 0;

function log_debug($msg) {

}

log_debug("========================================");
log_debug("LEER MENSAJES - INICIO");
log_debug("Last update del cliente: {$lastUpdate}");

// Obtener usuario actual
$objEncrip = new cEncriptacion();
require_once("../../../clases/cParametros.php");
$objParam = new cParametros();
$digitador = $objEncrip->decrypt($_SESSION[$objParam->p_nombres_session]);
$digitador_safe = addslashes($digitador);

// ============================================
// 1. OBTENER CUENTA ACTIVA DE LA EMPRESA
// ============================================
$sqlAccount = "SELECT id, phone_number_id, display_number, business_name 
               FROM fm_crm_whatsapp_accounts 
               WHERE is_active = 1 
               LIMIT 1";

$resultAccount = $objSql->consulta($sqlAccount, "NO HISTORIAL");

if (!$resultAccount || $resultAccount->num_rows == 0) {
    echo json_encode([
        'has_changes' => false,
        'mensajes'    => [],
        'timestamp'   => time()
    ]);
    exit;
}

$account            = $resultAccount->fetch_assoc();
$accountId          = $account['id'];
$phoneNumberId      = $account['phone_number_id'];
$phoneNumberId_safe = addslashes($phoneNumberId);

// ============================================
// 2. VERIFICAR SI HAY CAMBIOS DESDE last_update
// ============================================
$hasChanges = false;

if ($lastUpdate > 0) {
    $sqlCheckChanges = "SELECT COUNT(*) as cambios,
                        MAX(UNIX_TIMESTAMP(created_at)) as max_ts
    FROM fm_crm_whatsapp_messages
    WHERE phone_number_id = '{$phoneNumberId_safe}'
    AND UNIX_TIMESTAMP(created_at) > {$lastUpdate}";

    $resultChanges = $objSql->consulta($sqlCheckChanges, "NO HISTORIAL");

    if ($resultChanges) {
        $row        = $resultChanges->fetch_assoc();
        $hasChanges = ($row['cambios'] > 0);

        // Aunque no haya mensajes nuevos, si hay mensajes en BD hacer carga completa
        if (!$hasChanges) {
            $sqlHayMensajes = "SELECT COUNT(*) as total 
                               FROM fm_crm_whatsapp_messages 
                               WHERE phone_number_id = '{$phoneNumberId_safe}'";
            $resHay = $objSql->consulta($sqlHayMensajes, "NO HISTORIAL");
            if ($resHay) {
                $rowHay = $resHay->fetch_assoc();
                if ($rowHay['total'] > 0) {
                    $hasChanges = true;
                    log_debug("Forzando carga completa - hay {$rowHay['total']} mensajes en BD");
                }
            }
        }

        log_debug("SQL last_update: {$lastUpdate}");
        log_debug("Cambios detectados: " . ($hasChanges ? 'SI' : 'NO'));
    }
} else {
    // Primera carga, siempre hay "cambios"
    $hasChanges = true;
    log_debug("Primera carga - has_changes = true");
}

// Si no hay cambios, responder rápido
if (!$hasChanges && $lastUpdate > 0) {
    log_debug("No hay cambios - Respuesta rapida");
    echo json_encode([
        'has_changes' => false,
        'mensajes'    => [],
        'timestamp'   => time()
    ]);
    exit;
}

// ============================================
// 3. SI HAY CAMBIOS, CARGAR TODO
// ============================================
log_debug("Cargando conversaciones completas...");

// JOIN con fm_crm_whatsapp_contacts para traer nombres guardados
$sqlConversations = "SELECT 
    m.phone_number,
    MAX(COALESCE(m.message_timestamp, UNIX_TIMESTAMP(m.created_at))) as ultimo_timestamp,
    MAX(m.created_at) as ultima_fecha,
    MAX(c.custom_name) as custom_name,
    MAX(c.wa_name) as wa_name
FROM fm_crm_whatsapp_messages m
LEFT JOIN fm_crm_whatsapp_contacts c ON c.phone_number = m.phone_number
WHERE m.phone_number_id = '{$phoneNumberId_safe}'
GROUP BY m.phone_number
ORDER BY ultimo_timestamp DESC";

$resultConv = $objSql->consulta($sqlConversations, "NO HISTORIAL");

$mensajesFormato    = [];
$maxTimestampGlobal = 0;

if ($resultConv && $resultConv->num_rows > 0) {
    while ($conv = $resultConv->fetch_assoc()) {
        $phoneNumber      = $conv['phone_number'];
        $phoneNumber_safe = addslashes($phoneNumber);

        $sqlMessages = "SELECT * 
        FROM fm_crm_whatsapp_messages
        WHERE phone_number_id = '{$phoneNumberId_safe}'
        AND phone_number = '{$phoneNumber_safe}'
        ORDER BY COALESCE(message_timestamp, UNIX_TIMESTAMP(created_at)) ASC
        LIMIT 100";

        $resultMessages = $objSql->consulta($sqlMessages, "NO HISTORIAL");

        $mensajes      = [];
        $ventanaExpira = 0;
        $dentroDe24h   = false;
        $unreadCount   = 0;

        if ($resultMessages && $resultMessages->num_rows > 0) {
            while ($msg = $resultMessages->fetch_assoc()) {
                $msgTimestamp = $msg['message_timestamp'];

                if ($msgTimestamp === null || $msgTimestamp === '' || $msgTimestamp == 0) {
                    if (!empty($msg['created_at'])) {
                        $msgTimestamp = strtotime($msg['created_at']);
                    } else {
                        $msgTimestamp = time();
                    }
                    log_debug("Mensaje {$msg['id']}: usando created_at como fallback (ts={$msgTimestamp})");
                }

                $createdAtTs = !empty($msg['created_at']) ? strtotime($msg['created_at']) : time();
                if ($createdAtTs > $maxTimestampGlobal) {
                    $maxTimestampGlobal = $createdAtTs;
                }

                $mensajes[] = [
                    'id'         => $msg['id'] ?? null,
                    'message_id' => $msg['message_id'] ?? null,
                    'texto'      => !empty($msg['text_body']) ? $msg['text_body'] : '[' . strtoupper($msg['message_type'] ?? 'UNKNOWN') . ']',
                    'tipo'       => ($msg['direction'] ?? '') === 'inbound' ? 'recibido' : 'enviado',
                    'media_type' => $msg['message_type'] ?? 'text',
                    'media_url'  => $msg['media_url'] ?? null,
                    'filename'   => $msg['media_filename'] ?? null,
                    'timestamp'  => $msgTimestamp,
                    'hora'       => date('H:i', $msgTimestamp),
                    'fecha'      => $msg['message_date'] ?? null,
                    'status'     => $msg['status'] ?? 'unknown',
                    'is_read'    => intval($msg['is_read'] ?? 0)
                ];

                if (($msg['message_type'] ?? '') === 'location' && !empty($msg['media_caption'])) {
                    $locationData = json_decode($msg['media_caption'], true);
                    if ($locationData) {
                        $mensajes[count($mensajes) - 1]['location'] = $locationData;
                    }
                }

                if (($msg['direction'] ?? '') === 'inbound') {
                    $ventanaExpira = $msgTimestamp + (24 * 3600);
                    $dentroDe24h   = (time() < $ventanaExpira);

                    if (intval($msg['is_read'] ?? 0) === 0) {
                        $unreadCount++;
                    }
                }
            }
        }

        // Número formateado como fallback si no hay nombre guardado
        $displayNumber = $phoneNumber;
        if (strlen($phoneNumber) >= 10) {
            $displayNumber = '+' . substr($phoneNumber, 0, 3) . ' ' .
                             substr($phoneNumber, 3, 2) . ' ' .
                             substr($phoneNumber, 5, 3) . ' ' .
                             substr($phoneNumber, 8);
        }

        // Prioridad: custom_name > wa_name > número formateado
        $nombreFinal = $conv['custom_name'] ?? $conv['wa_name'] ?? $displayNumber;

        $mensajesFormato[$phoneNumber] = [
            'phone_number'         => $phoneNumber,
            'nombre'               => $nombreFinal,
            'custom_name'          => $conv['custom_name'] ?? null,
            'wa_name'              => $conv['wa_name'] ?? null,
            'mensajes'             => $mensajes,
            'ultimo_timestamp'     => $conv['ultimo_timestamp'],
            'ventana_24h_expira'   => $ventanaExpira,
            'is_within_24h'        => $dentroDe24h,
            'received_on_phone_id' => $phoneNumberId,
            'account_id'           => $accountId,
            'unread_count'         => $unreadCount
        ];
    }
}

log_debug("========================================");

$responseTimestamp = $maxTimestampGlobal > 0 ? $maxTimestampGlobal : time();

log_debug("Total conversaciones procesadas: " . count($mensajesFormato));
log_debug("maxTimestampGlobal: {$maxTimestampGlobal}");
log_debug("responseTimestamp: {$responseTimestamp}");
log_debug("========================================");

echo json_encode([
    'has_changes'  => true,
    'mensajes'     => $mensajesFormato,
    'timestamp'    => $responseTimestamp,
    'account_info' => [
        'id'              => $accountId,
        'phone_number_id' => $phoneNumberId,
        'display_number'  => $account['display_number'],
        'business_name'   => $account['business_name']
    ]
], JSON_UNESCAPED_UNICODE);
?>
