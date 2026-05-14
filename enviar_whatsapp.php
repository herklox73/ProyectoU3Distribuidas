<?php
error_reporting(0);
ini_set('display_errors', 0);
session_start();
header('Content-Type: application/json');


// ✅ Cargar configuración de WhatsApp (BD GENERAL)
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

// Cargar configuración desde variables globales (ya cargadas por config.php)
if (!configuracionesWhatsAppValidas($whatsappToken, $whatsappPhoneId)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'Configuración de WhatsApp inválida. Intenta reconectar tu cuenta.']
    ]);
    exit;
}

// Recibir datos
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['to'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'Falta parámetro: to es requerido']
    ]);
    exit;
}

$to = preg_replace('/[^0-9]/', '', $data['to']);
$message = isset($data['message']) ? trim($data['message']) : '';

if (empty($message)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => ['message' => 'El mensaje no puede estar vacío']
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
// PREPARAR PAYLOAD SEGÚN VENTANA
// ============================================
$url = API_BASE_URL . "{$whatsappPhoneId}/messages";

if ($dentroDe24h) {
    // ✅ DENTRO DE VENTANA → TEXTO LIBRE
    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type' => 'individual',
        'to' => $to,
        'type' => 'text',
        'text' => [
            'body' => $message
        ]
    ];
    $tipoMensaje = 'texto_libre';
} else {
    // ❌ FUERA DE VENTANA → TEMPLATE
    $payload = [
        'messaging_product' => 'whatsapp',
        'to' => $to,
        'type' => 'template',
        'template' => [
            'name' => 'hello_world',
            'language' => ['code' => 'en_US']
        ]
    ];
    $tipoMensaje = 'template';
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
    CURLOPT_TIMEOUT => 30
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

$result = json_decode($response, true);

// ============================================
// LOG DETALLADO
// ============================================
$logData = [
    'timestamp' => date('Y-m-d H:i:s'),
    'to' => $to,
    'message' => $message,
    'tipo_enviado' => $tipoMensaje,
    'dentro_ventana_24h' => $dentroDe24h,
    'ventana_expira' => $ventanaExpira > 0 ? date('Y-m-d H:i:s', $ventanaExpira) : 'No definida',
    'phone_number_id_usado' => $whatsappPhoneId,
    'display_number_usado' => $whatsappNumber,
    'usuario' => $digitador,
    'http_code' => $httpCode,
    'curl_error' => $curlError,
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
    $textoGuardado = $dentroDe24h ? $message : "Hello, World!";
    $messageId = $result['messages'][0]['id'] ?? null;
    
    // ✅ GUARDAR DIRECTAMENTE EN BD (SIN WhatsAppMessages.php)
    $timestamp = time();
    $dateFormatted = date('Y-m-d H:i:s', $timestamp);
    
    $message_safe = addslashes($textoGuardado);
    $messageId_safe = $messageId ? "'" . addslashes($messageId) . "'" : "NULL";
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
        'text',
        '{$message_safe}',
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
        'tipo_mensaje' => $tipoMensaje,
        'dentro_ventana_24h' => $dentroDe24h,
        'texto_enviado' => $textoGuardado,
        'phone_number_usado' => $whatsappNumber,
        'ventana_expira_en' => $ventanaExpira > 0 ? date('Y-m-d H:i:s', $ventanaExpira) : 'No definida',
        'data' => $result
    ]);
} else {
    http_response_code($httpCode > 0 ? $httpCode : 500);
    echo json_encode([
        'success' => false,
        'error' => [
            'message' => $result['error']['message'] ?? $curlError ?: 'Error desconocido',
            'code' => $result['error']['code'] ?? null,
            'tipo_intentado' => $tipoMensaje,
            'dentro_ventana_24h' => $dentroDe24h,
            'full_response' => $result
        ],
        'http_code' => $httpCode
    ]);
}
?>
