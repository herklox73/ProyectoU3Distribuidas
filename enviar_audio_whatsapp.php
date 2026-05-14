<?php
error_reporting(0);
ini_set('display_errors', 0);
session_start();
header('Content-Type: application/json');


require_once 'config.php';

$objSql = new cSql;

// ── Validar sesión ──
if (!isset($_SESSION['whatsapp_connected']) || !$_SESSION['whatsapp_connected']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => ['message' => 'No tienes WhatsApp conectado.']]);
    exit;
}

if (!configuracionesWhatsAppValidas($whatsappToken, $whatsappPhoneId)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => ['message' => 'Configuración de WhatsApp inválida.']]);
    exit;
}

// ── Validar archivo ──
if (!isset($_FILES['audio'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => ['message' => 'No se recibió audio']]);
    exit;
}

$file = $_FILES['audio'];
$to   = $_POST['to'] ?? null;

if (!$to) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => ['message' => 'Falta parámetro: to']]);
    exit;
}

$to = preg_replace('/[^0-9]/', '', $to);

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => ['message' => 'Error al recibir el audio']]);
    exit;
}

// ── Validar ventana 24h ──
$dentroDe24h = false;
$to_safe = addslashes($to);
$sql24h = "SELECT message_timestamp FROM fm_crm_whatsapp_messages 
           WHERE phone_number = '{$to_safe}' AND direction = 'inbound' 
           ORDER BY message_timestamp DESC LIMIT 1";
$result24h = $objSql->consulta($sql24h, "NO HISTORIAL");

if ($result24h && $result24h->num_rows > 0) {
    $lastInbound   = $result24h->fetch_assoc();
    $ventanaExpira = $lastInbound['message_timestamp'] + (24 * 3600);
    $dentroDe24h   = (time() < $ventanaExpira);
}

if (!$dentroDe24h) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => ['message' => 'No puedes enviar audios fuera de la ventana de 24h.']]);
    exit;
}

try {
    // ── Guardar audio en servidor (temporalmente con nombre genérico) ──
    $uploadDir = __DIR__ . '/uploads/audio/';
    if (!file_exists($uploadDir)) mkdir($uploadDir, 0755, true);

    $tempFilename = 'voz_' . time() . '_' . uniqid() . '.tmp';
    $tempFilepath = $uploadDir . $tempFilename;

    if (!move_uploaded_file($file['tmp_name'], $tempFilepath)) {
        throw new Exception('Error al guardar el audio en servidor');
    }

    // ── Detectar mime type real ──
    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $mimeReal = $finfo->file($tempFilepath);

    // Normalizar mime para Meta
    if (strpos($mimeReal, 'webm') !== false) {
        $mimeParaMeta = 'audio/webm';
        $extReal      = 'webm';
    } elseif (strpos($mimeReal, 'ogg') !== false) {
        $mimeParaMeta = 'audio/ogg';
        $extReal      = 'ogg';
    } elseif (strpos($mimeReal, 'mpeg') !== false || strpos($mimeReal, 'mp3') !== false) {
        $mimeParaMeta = 'audio/mpeg';
        $extReal      = 'mp3';
    } elseif (strpos($mimeReal, 'mp4') !== false) {
        $mimeParaMeta = 'audio/mp4';
        $extReal      = 'm4a';
    } else {
        // Fallback: intentar con webm que es lo que graba Chrome/Firefox
        $mimeParaMeta = 'audio/webm';
        $extReal      = 'webm';
    }

    // Renombrar con extensión correcta
    $filename = 'voz_' . time() . '_' . uniqid() . '.' . $extReal;
    $filepath = $uploadDir . $filename;
    rename($tempFilepath, $filepath);

    // ── Log diagnóstico ──
    file_put_contents(__DIR__ . '/whatsapp_log.txt',
        json_encode([
            'timestamp'     => date('Y-m-d H:i:s'),
            'paso'          => 'DETECCION_MIME',
            'mime_real'     => $mimeReal,
            'mime_para_meta'=> $mimeParaMeta,
            'ext_real'      => $extReal,
            'filename'      => $filename,
            'filesize'      => filesize($filepath)
        ], JSON_PRETTY_PRINT) . "\n---\n", FILE_APPEND);

    // ── PASO 1: Subir a Meta Media Upload API ──
    $uploadUrl = API_BASE_URL . "{$whatsappPhoneId}/media";
    $cfile     = new CURLFile($filepath, $mimeParaMeta, $filename);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL        => $uploadUrl,
        CURLOPT_POST       => true,
        CURLOPT_POSTFIELDS => [
            'messaging_product' => 'whatsapp',
            'type'              => $mimeParaMeta,
            'file'              => $cfile,
        ],
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $whatsappToken],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT        => 60
    ]);

    $uploadResponse = curl_exec($ch);
    $uploadHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $uploadResult = json_decode($uploadResponse, true);

    file_put_contents(__DIR__ . '/whatsapp_log.txt',
        json_encode([
            'timestamp'       => date('Y-m-d H:i:s'),
            'paso'            => 'UPLOAD_META',
            'http_code'       => $uploadHttpCode,
            'response'        => $uploadResult
        ], JSON_PRETTY_PRINT) . "\n---\n", FILE_APPEND);

    if ($uploadHttpCode !== 200 || !isset($uploadResult['id'])) {
        throw new Exception('Error al subir audio a Meta: ' . ($uploadResult['error']['message'] ?? 'Error desconocido'));
    }

    $mediaId = $uploadResult['id'];

    // ── PASO 2: Enviar mensaje de audio con media_id ──
    $sendUrl = API_BASE_URL . "{$whatsappPhoneId}/messages";

    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type'    => 'individual',
        'to'                => $to,
        'type'              => 'audio',
        'audio'             => ['id' => $mediaId]
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $sendUrl,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $whatsappToken
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT        => 30
    ]);

    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $result = json_decode($response, true);

    file_put_contents(__DIR__ . '/whatsapp_log.txt',
        json_encode([
            'timestamp'  => date('Y-m-d H:i:s'),
            'paso'       => 'ENVIO_MENSAJE',
            'to'         => $to,
            'media_id'   => $mediaId,
            'http_code'  => $httpCode,
            'response'   => $result
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n---\n", FILE_APPEND);

    if ($httpCode == 200 && isset($result['messages'])) {
        $messageId     = $result['messages'][0]['id'] ?? null;
        $timestamp     = time();
        $dateFormatted = date('Y-m-d H:i:s', $timestamp);

        $messageId_safe = $messageId ? "'" . addslashes($messageId) . "'" : "NULL";
        $digitador_safe = addslashes($digitador);
        $phoneId_safe   = addslashes($whatsappPhoneId);
        $filename_safe  = addslashes($filename);
        $audioUrl       = 'http://localhost/whatsApp/uploads/audio/' . $filename;
        $audioUrl_safe  = addslashes($audioUrl);

        $sqlInsert = "INSERT INTO fm_crm_whatsapp_messages (
            whatsapp_account_id, phone_number_id, message_id, phone_number,
            direction, message_type, text_body, media_url, media_filename,
            status, sent_by, message_timestamp, message_date, created_at
        ) VALUES (
            {$whatsappAccountId}, '{$phoneId_safe}', {$messageId_safe}, '{$to_safe}',
            'outbound', 'audio', '[Audio]', '{$audioUrl_safe}', '{$filename_safe}',
            'sent', '{$digitador_safe}', {$timestamp}, '{$dateFormatted}', NOW()
        )";

        $objSql->consulta($sqlInsert, "NO HISTORIAL");

        echo json_encode([
            'success'    => true,
            'message_id' => $messageId,
            'media_id'   => $mediaId,
            'filename'   => $filename,
            'mime'       => $mimeParaMeta
        ]);
    } else {
        @unlink($filepath);
        throw new Exception($result['error']['message'] ?? 'Error al enviar audio');
    }

} catch (Exception $e) {
    if (isset($filepath) && file_exists($filepath))     @unlink($filepath);
    if (isset($tempFilepath) && file_exists($tempFilepath)) @unlink($tempFilepath);

    file_put_contents(__DIR__ . '/whatsapp_log.txt',
        json_encode([
            'timestamp' => date('Y-m-d H:i:s'),
            'paso'      => 'ERROR',
            'mensaje'   => $e->getMessage()
        ], JSON_PRETTY_PRINT) . "\n---\n", FILE_APPEND);

    http_response_code(500);
    echo json_encode(['success' => false, 'error' => ['message' => $e->getMessage()]]);
}
?>
