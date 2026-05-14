<?php
error_reporting(0);
ini_set('display_errors', 0);
session_start();
header('Content-Type: application/json');

// Cargar sistema

// Cargar configuración de WhatsApp
require_once 'config.php';

$objSql = new cSql;

// ============================================
// VALIDAR QUE EL USUARIO TENGA WHATSAPP CONECTADO
// ============================================
if (!isset($_SESSION['whatsapp_connected']) || !$_SESSION['whatsapp_connected']) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'No tienes WhatsApp conectado. Por favor conecta tu cuenta primero.'],
        'action_required' => 'connect_whatsapp'
    ]);
    exit;
}

// Validar configuración (usa variables globales de config.php)
if (!configuracionesWhatsAppValidas($whatsappToken, $whatsappPhoneId)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'Configuración de WhatsApp inválida. Intenta reconectar tu cuenta.']
    ]);
    exit;
}

// ============================================
// VALIDAR QUE SE RECIBIÓ UN ARCHIVO
// ============================================
if (!isset($_FILES['imagen'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'No se recibió ningún archivo']
    ]);
    exit;
}

$file = $_FILES['imagen'];
$to = $_POST['to'] ?? null;
$caption = $_POST['caption'] ?? '';

if (!$to) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'Falta parámetro: to es requerido']
    ]);
    exit;
}

// Limpiar número
$to = preg_replace('/[^0-9]/', '', $to);

// ============================================
// VALIDAR ARCHIVO (IMAGEN O VIDEO)
// ============================================
$allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
$allowedVideoTypes = ['video/mp4', 'video/3gpp'];
$allAllowedTypes = array_merge($allowedImageTypes, $allowedVideoTypes);

$isImage = in_array($file['type'], $allowedImageTypes);
$isVideo = in_array($file['type'], $allowedVideoTypes);

if (!in_array($file['type'], $allAllowedTypes)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'Tipo de archivo no válido. Solo JPG, PNG, WEBP, MP4 o 3GPP']
    ]);
    exit;
}

// Validar tamaño según tipo
$maxSize = $isImage ? 5 * 1024 * 1024 : 16 * 1024 * 1024; // 5MB imágenes, 16MB videos
$maxSizeText = $isImage ? '5MB' : '16MB';

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => ['message' => "El archivo es muy grande (máx {$maxSizeText})"]
    ]);
    exit;
}

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'Error al subir el archivo']
    ]);
    exit;
}

// ============================================
// DETECTAR VENTANA DE 24H
// ============================================
$dentroDe24h = false;
$ventanaExpira = 0;

$to_safe = addslashes($to);
$sql24h = "SELECT message_timestamp 
           FROM fm_crm_whatsapp_messages 
           WHERE phone_number = '{$to_safe}' 
           AND direction = 'inbound' 
           ORDER BY message_timestamp DESC 
           LIMIT 1";
$result24h = $objSql->consulta($sql24h, "NO HISTORIAL");

if ($result24h && $result24h->num_rows > 0) {
    $lastInbound = $result24h->fetch_assoc();
    $ventanaExpira = $lastInbound['message_timestamp'] + (24 * 3600);
    $dentroDe24h = (time() < $ventanaExpira);
}

// ============================================
// VERIFICAR VENTANA
// ============================================
if (!$dentroDe24h) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => [
            'message' => 'No puedes enviar archivos multimedia fuera de la ventana de 24h.',
            'ventana_expirada' => true,
            'ventana_expiro_en' => $ventanaExpira > 0 ? date('Y-m-d H:i:s', $ventanaExpira) : 'No definida'
        ]
    ]);
    exit;
}

// ============================================
// GUARDAR ARCHIVO EN SERVIDOR
// ============================================
try {

    $carpetaTipo = $isImage ? 'imagen' : 'video';
    $uploadDir = __DIR__ . '/uploads/' . $carpetaTipo . '/';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    // Generar nombre único
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $prefix = $isImage ? 'img_' : 'vid_';
    $filename = $prefix . time() . '_' . uniqid() . '.' . $extension;
    $filepath = $uploadDir . $filename;
    
    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        throw new Exception('Error al guardar el archivo');
    }
    
    $fileUrl = 'http://localhost/whatsApp/uploads/' . $carpetaTipo . '/' . $filename;
    
    // ============================================
    // PREPARAR PAYLOAD
    // ============================================
    $url = API_BASE_URL . "{$whatsappPhoneId}/messages";
    
    $mediaType = $isImage ? 'image' : 'video';
    
    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type' => 'individual',
        'to' => $to,
        'type' => $mediaType,
        $mediaType => [
            'link' => $fileUrl
        ]
    ];
    
    // Agregar caption si existe
    if (!empty($caption)) {
        $payload[$mediaType]['caption'] = $caption;
    }
    
    // ============================================
    // ENVIAR CON CURL
    // ============================================
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $whatsappToken
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 60
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    
    $result = json_decode($response, true);
    
    // ============================================
    // LOG
    // ============================================
    $logData = [
        'timestamp' => date('Y-m-d H:i:s'),
        'to' => $to,
        'tipo' => $mediaType,
        'filename' => $filename,
        'file_url' => $fileUrl,
        'caption' => $caption,
        'filesize' => $file['size'],
        'dentro_ventana_24h' => $dentroDe24h,
        'phone_number_id_usado' => $whatsappPhoneId,
        'display_number_usado' => $whatsappNumber,
        'usuario' => $digitador,
        'http_code' => $httpCode,
        'response' => $result
    ];
    
    file_put_contents(
        __DIR__ . '/whatsapp_log.txt', 
        json_encode($logData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n---\n", 
        FILE_APPEND
    );
    
    // ============================================
    // PROCESAR RESPUESTA
    // ============================================
    if ($httpCode == 200 && isset($result['messages'])) {
        $messageId = $result['messages'][0]['id'] ?? null;
        
        // ✅ GUARDAR DIRECTAMENTE EN BD
        $timestamp = time();
        $dateFormatted = date('Y-m-d H:i:s', $timestamp);
        
        $messageId_safe = $messageId ? "'" . addslashes($messageId) . "'" : "NULL";
        $caption_safe = addslashes($caption);
        $fileUrl_safe = addslashes($fileUrl);
        $filename_safe = addslashes($filename);
        $digitador_safe = addslashes($digitador);
        $phoneId_safe = addslashes($whatsappPhoneId);
        $mediaType_safe = addslashes($mediaType);
        
        $sqlInsert = "INSERT INTO fm_crm_whatsapp_messages (
            whatsapp_account_id,
            phone_number_id,
            message_id,
            phone_number,
            direction,
            message_type,
            text_body,
            media_url,
            media_filename,
            media_caption,
            status,
            sent_by,
            message_timestamp,
            message_date,
            created_at
        ) VALUES (
            {$whatsappAccountId},
            '{$phoneId_safe}',
            {$messageId_safe},
            '{$to_safe}',
            'outbound',
            '{$mediaType_safe}',
            '{$caption_safe}',
            '{$fileUrl_safe}',
            '{$filename_safe}',
            '{$caption_safe}',
            'sent',
            '{$digitador_safe}',
            {$timestamp},
            '{$dateFormatted}',
            NOW()
        )";
        
        $objSql->consulta($sqlInsert, "NO HISTORIAL");
        
        echo json_encode([
            'success' => true,
            'message_id' => $messageId,
            'file_url' => $fileUrl,
            'filename' => $filename,
            'caption' => $caption,
            'media_type' => $mediaType,
            'phone_number_usado' => $whatsappNumber,
            'data' => $result
        ]);
    } else {
        if (file_exists($filepath)) {
            @unlink($filepath);
        }
        
        http_response_code($httpCode > 0 ? $httpCode : 500);
        echo json_encode([
            'success' => false,
            'error' => [
                'message' => $result['error']['message'] ?? $curlError ?: 'Error desconocido',
                'code' => $result['error']['code'] ?? null,
                'full_response' => $result
            ],
            'http_code' => $httpCode
        ]);
    }
    
} catch (Exception $e) {
    if (isset($filepath) && file_exists($filepath)) {
        @unlink($filepath);
    }
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ['message' => $e->getMessage()]
    ]);
}
?>
