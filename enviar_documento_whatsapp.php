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
        'error' => 'No tienes WhatsApp conectado. Por favor conecta tu cuenta primero.',
        'action_required' => 'connect_whatsapp'
    ]);
    exit;
}

// Validar configuración (usa variables globales de config.php)
if (!configuracionesWhatsAppValidas($whatsappToken, $whatsappPhoneId)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Configuración de WhatsApp inválida. Intenta reconectar tu cuenta.'
    ]);
    exit;
}

// ============================================
// VALIDAR QUE SE RECIBIÓ UN DOCUMENTO
// ============================================
if (!isset($_FILES['documento'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'No se recibió ningún documento'
    ]);
    exit;
}

$file = $_FILES['documento'];
$to = $_POST['to'] ?? null;
$caption = $_POST['caption'] ?? '';
$filename = $_POST['filename'] ?? $file['name'];

if (!$to) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Falta el destinatario'
    ]);
    exit;
}

$to = preg_replace('/[^0-9]/', '', $to);

// ============================================
// VALIDAR ARCHIVO
// ============================================
$allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed'
];

$extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip'];

if (!in_array($file['type'], $allowedTypes) && !in_array($extension, $allowedExtensions)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Tipo de documento no válido. Solo PDF, Word, Excel, PowerPoint, TXT o ZIP'
    ]);
    exit;
}

// Validar tamaño (100MB para documentos)
if ($file['size'] > 100 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'El documento es muy grande (máx 100MB)'
    ]);
    exit;
}

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Error al subir el archivo'
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

if (!$dentroDe24h) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'No puedes enviar documentos fuera de la ventana de 24h'
    ]);
    exit;
}

// ============================================
// GUARDAR DOCUMENTO
// ============================================
try {
    $uploadDir = __DIR__ . '/uploads/documento/';
    if (!file_exists($uploadDir)) mkdir($uploadDir, 0755, true);
    
    // Generar nombre único pero mantener extensión original
    $savedFilename = 'doc_' . time() . '_' . uniqid() . '.' . $extension;
    $filepath = $uploadDir . $savedFilename;
    
    // Generar nombre único pero mantener extensión original
    $savedFilename = 'doc_' . time() . '_' . uniqid() . '.' . $extension;
    $filepath = $uploadDir . $savedFilename;
    
    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        throw new Exception('Error al guardar el documento');
    }
    
    $documentUrl = 'http://localhost/whatsApp/uploads/documento/' . $savedFilename;
    
    // ============================================
    // ENVIAR A WHATSAPP
    // ============================================
    $url = API_BASE_URL . "{$whatsappPhoneId}/messages";
    
    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type' => 'individual',
        'to' => $to,
        'type' => 'document',
        'document' => [
            'link' => $documentUrl,
            'filename' => $file['name']
        ]
    ];
    
    // Agregar caption si existe
    if (!empty($caption)) {
        $payload['document']['caption'] = $caption;
    }
    
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
    
    // Log
    file_put_contents(
        __DIR__ . '/whatsapp_log.txt',
        json_encode([
            'timestamp' => date('Y-m-d H:i:s'),
            'to' => $to,
            'tipo' => 'documento',
            'filename' => $savedFilename,
            'original_name' => $file['name'],
            'document_url' => $documentUrl,
            'phone_number_id_usado' => $whatsappPhoneId,
            'display_number_usado' => $whatsappNumber,
            'usuario' => $digitador,
            'http_code' => $httpCode,
            'response' => $result
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n---\n",
        FILE_APPEND
    );
    
    if ($httpCode == 200 && isset($result['messages'])) {
        $messageId = $result['messages'][0]['id'];
        
        // ✅ GUARDAR DIRECTAMENTE EN BD
        $timestamp = time();
        $dateFormatted = date('Y-m-d H:i:s', $timestamp);
        
        $messageId_safe = "'" . addslashes($messageId) . "'";
        $caption_safe = addslashes($caption ?: '[Documento: ' . $file['name'] . ']');
        $documentUrl_safe = addslashes($documentUrl);
        $savedFilename_safe = addslashes($savedFilename);
        $digitador_safe = addslashes($digitador);
        $phoneId_safe = addslashes($whatsappPhoneId);
        
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
            'document',
            '{$caption_safe}',
            '{$documentUrl_safe}',
            '{$savedFilename_safe}',
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
            'document_url' => $documentUrl,
            'filename' => $savedFilename,
            'original_name' => $file['name']
        ]);
    } else {
        @unlink($filepath);
        throw new Exception($result['error']['message'] ?? 'Error al enviar');
    }
    
} catch (Exception $e) {
    if (isset($filepath) && file_exists($filepath)) @unlink($filepath);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
