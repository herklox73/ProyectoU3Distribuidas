<?php
// ===== webhook.php - WEBHOOK UNIFICADO =====
if (defined('WEBHOOK_EJECUTADO')) exit;
define('WEBHOOK_EJECUTADO', true);

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/webhook_errors.log');

// ============================================
// FUNCIÓN DE LOG
// ============================================
function log_webhook($msg) {
    $logMsg = date('Y-m-d H:i:s') . " - " . $msg . "\n";
    @file_put_contents(__DIR__ . '/webhook.log', $logMsg, FILE_APPEND);
    error_log("WEBHOOK: " . $msg);
}

log_webhook("========================================");
log_webhook("WEBHOOK - INICIO");
log_webhook("Fecha/Hora: " . date('Y-m-d H:i:s'));
log_webhook("IP Origen: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
log_webhook("Método: " . ($_SERVER['REQUEST_METHOD'] ?? 'unknown'));

// ============================================
// CONFIGURACIÓN
// ============================================
$VERIFY_TOKEN = "AQUI_TU_NUEVO_TOKEN_WEBHOOK";

// ============================================
// VERIFICACIÓN GET (Meta valida el webhook)
// ============================================
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    log_webhook("GET - Verificación de Meta");
    
    $mode = $_GET['hub_mode'] ?? '';
    $token = $_GET['hub_verify_token'] ?? '';
    $challenge = $_GET['hub_challenge'] ?? '';
    
    log_webhook("Mode: {$mode}");
    log_webhook("Token recibido: {$token}");
    
    if ($mode === 'subscribe' && $token === $VERIFY_TOKEN) {
        log_webhook("✓ Verificación exitosa");
        echo $challenge;
        exit;
    }
    
    log_webhook("✗ Verificación fallida");
    http_response_code(403);
    exit;
}

// ============================================
// POST (Mensaje de Meta)
// ============================================
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    log_webhook("ERROR: Método no permitido: " . $_SERVER['REQUEST_METHOD']);
    http_response_code(405);
    exit;
}

// Leer payload de Meta
$input = file_get_contents("php://input");
$data = json_decode($input, true);

log_webhook("Payload recibido: " . strlen($input) . " bytes");

// Guardar payload para debug
@file_put_contents(__DIR__ . '/webhook_payload.log', 
    date('Y-m-d H:i:s') . "\n" . json_encode($data, JSON_PRETTY_PRINT) . "\n---\n", 
    FILE_APPEND);

// ============================================
// RESPONDER INMEDIATAMENTE A META (IMPORTANTE)
// ============================================
http_response_code(200);
echo "EVENT_RECEIVED";

// Cerrar la conexión con Meta inmediatamente
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
} else {
    flush();
}

log_webhook("✓ Respondido 200 OK a Meta");

if (!$data) {
    log_webhook("ADVERTENCIA: Payload vacío o inválido");
    exit;
}

// ============================================
// EXTRAER phone_number_id
// ============================================
log_webhook("Extrayendo phone_number_id...");

$phone_number_id = null;

if (isset($data['entry'][0]['changes'][0]['value']['metadata']['phone_number_id'])) {
    $phone_number_id = $data['entry'][0]['changes'][0]['value']['metadata']['phone_number_id'];
} elseif (isset($data['entry'][0]['changes'][0]['value']['phone_number_id'])) {
    $phone_number_id = $data['entry'][0]['changes'][0]['value']['phone_number_id'];
}

if (!$phone_number_id) {
    log_webhook("ERROR: No se pudo extraer phone_number_id");
    exit;
}

log_webhook("✓ phone_number_id: {$phone_number_id}");

// ============================================
// CARGAR CREDENCIALES Y CONECTAR BD
// ============================================
require_once('config.php');
$conn_empresa = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($conn_empresa->connect_error) {
    log_webhook("ERROR conectando a base de datos: " . $conn_empresa->connect_error);
    exit;
}
$conn_empresa->set_charset('utf8mb4');
log_webhook("✓ Conectado a base de datos: " . DB_NAME);

// ============================================
// PROCESAR ESTADOS
// ============================================
if (isset($data['entry'][0]['changes'][0]['value']['statuses'])) {
    log_webhook("Procesando estados...");
    
    $processedCount = 0;
    
    foreach ($data['entry'][0]['changes'][0]['value']['statuses'] as $status) {
        $msgId = $conn_empresa->real_escape_string($status['id']);
        $statusType = $conn_empresa->real_escape_string($status['status']);
        
        $sql = "UPDATE fm_crm_whatsapp_messages 
                SET status = '{$statusType}' 
                WHERE message_id = '{$msgId}'";
        
        if ($conn_empresa->query($sql)) {
            log_webhook("✓ Estado actualizado: {$msgId} -> {$statusType}");
            $processedCount++;
        } else {
            log_webhook("✗ Error actualizando estado: " . $conn_empresa->error);
        }
    }
    
    log_webhook("✓ {$processedCount} estado(s) procesado(s)");
    $conn_empresa->close();
    exit;
}

// ============================================
// PROCESAR MENSAJES
// ============================================
if (isset($data['entry'][0]['changes'][0]['value']['messages'][0])) {
    log_webhook("Procesando mensaje...");
    
    try {
        $value = $data['entry'][0]['changes'][0]['value'];
        $msg = $value['messages'][0];
        
        $from = $msg['from'];
        $msgId = $msg['id'];
        $timestamp = $msg['timestamp'];
        $type = $msg['type'];
        $phoneId = $value['metadata']['phone_number_id'] ?? null;
        
        log_webhook("De: {$from} | Tipo: {$type}");
        
        // Buscar cuenta y obtener token
        $accountId = null;
        $whatsappToken = null;
        
        $phoneId_clean = $conn_empresa->real_escape_string($phoneId);
        $sqlAcc = "SELECT id, connected_by, access_token 
                   FROM fm_crm_whatsapp_accounts 
                   WHERE phone_number_id = '{$phoneId_clean}' AND is_active = 1 
                   LIMIT 1";
        
        $resAcc = $conn_empresa->query($sqlAcc);
        
        if ($resAcc && $resAcc->num_rows > 0) {
            $row = $resAcc->fetch_assoc();
            $accountId = $row['id'];
            $whatsappToken = $row['access_token'];
            log_webhook("✓ Cuenta encontrada - ID: {$accountId}");
        } else {
            log_webhook("⚠ Cuenta no encontrada en {$EMPR_BASEXX}");
        }
        
        // ============================================
        // PROCESAR CONTENIDO SEGÚN TIPO
        // ============================================
        $texto = '';
        $mediaUrlFinal = null;
        $mediaFilename = null;
        $mediaCaption = null;
        $mediaMimeType = null;
        
        if ($type === 'text') {
            // Mensaje de texto simple
            $texto = $msg['text']['body'] ?? '';
            
        } elseif ($type === 'location') {
            // Ubicación
            $location = $msg['location'] ?? [];
            $lat = $location['latitude'] ?? 0;
            $lon = $location['longitude'] ?? 0;
            $texto = "[UBICACIÓN]";
            $mediaCaption = json_encode([
                'latitude' => $lat,
                'longitude' => $lon,
                'name' => $location['name'] ?? '',
                'address' => $location['address'] ?? ''
            ]);
            
        } elseif (in_array($type, ['image', 'sticker', 'video', 'audio', 'voice', 'document'])) {
            // Archivo multimedia
            $mediaObj = $msg[$type] ?? [];
            $mediaId = $mediaObj['id'] ?? null;
            $mediaMimeType = $mediaObj['mime_type'] ?? null;
            $mediaCaption = $mediaObj['caption'] ?? null;
            $mediaFilename = $mediaObj['filename'] ?? 'archivo';
            
            $texto = $mediaCaption ?: "[" . strtoupper($type) . "]";
            
            log_webhook("Media ID: {$mediaId} | MIME: {$mediaMimeType}");
            
            // DESCARGAR ARCHIVO SI HAY TOKEN
            if ($mediaId && $whatsappToken) {
                log_webhook("Descargando archivo multimedia...");
                
                // 1. Obtener URL de descarga
                $urlMetadata = API_BASE_URL . "{$mediaId}";
                
                $ch = curl_init();
                curl_setopt_array($ch, [
                    CURLOPT_URL => $urlMetadata,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => [
                        'Authorization: Bearer ' . $whatsappToken
                    ],
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_TIMEOUT => 30
                ]);
                
                $responseUrl = curl_exec($ch);
                $httpCodeUrl = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                
                if ($httpCodeUrl == 200) {
                    $dataUrl = json_decode($responseUrl, true);
                    $downloadUrl = $dataUrl['url'] ?? null;
                    
                    if ($downloadUrl) {
                        log_webhook("URL obtenida: {$downloadUrl}");
                        
                        // 2. Descargar el archivo
                        $ch = curl_init();
                        curl_setopt_array($ch, [
                            CURLOPT_URL => $downloadUrl,
                            CURLOPT_RETURNTRANSFER => true,
                            CURLOPT_HTTPHEADER => [
                                'Authorization: Bearer ' . $whatsappToken
                            ],
                            CURLOPT_SSL_VERIFYPEER => false,
                            CURLOPT_TIMEOUT => 60
                        ]);
                        
                        $fileContent = curl_exec($ch);
                        $httpCodeFile = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                        curl_close($ch);
                        
                        if ($httpCodeFile == 200 && $fileContent) {
                            // Determinar carpeta según tipo
                            $carpetaTipo = [
                                'image'    => 'imagen',
                                'sticker'  => 'imagen',
                                'video'    => 'video',
                                'audio'    => 'audio',
                                'voice'    => 'audio',
                                'document' => 'documento'
                            ][$type] ?? 'otros';
                            
                            $uploadDir = __DIR__ . '/uploads/' . $carpetaTipo . '/';

                            // ── LOGS DE DIAGNÓSTICO ──
                            log_webhook("=== DIAGNÓSTICO ARCHIVO ===");
                            log_webhook("__DIR__: " . __DIR__);
                            log_webhook("uploadDir: " . $uploadDir);
                            log_webhook("uploadDir realpath: " . (realpath($uploadDir) ?: 'NO EXISTE AUN'));
                            log_webhook("uploadDir existe: " . (file_exists($uploadDir) ? 'SI' : 'NO'));

                            if (!file_exists($uploadDir)) {
                                $mkdirResult = mkdir($uploadDir, 0755, true);
                                log_webhook("mkdir resultado: " . ($mkdirResult ? 'OK' : 'FALLO'));
                                log_webhook("uploadDir tras mkdir: " . (file_exists($uploadDir) ? 'SI' : 'NO'));
                            } else {
                                log_webhook("Carpeta ya existia");
                            }

                            log_webhook("Es writable: " . (is_writable($uploadDir) ? 'SI' : 'NO'));
                            // ── FIN DIAGNÓSTICO ──
                            
                            // Determinar extensión
                            $extension = 'bin';
                            if ($mediaMimeType) {
                                $mimeToExt = [
                                    'image/jpeg' => 'jpg',
                                    'image/jpg' => 'jpg',
                                    'image/png' => 'png',
                                    'image/webp' => 'webp',
                                    'video/mp4' => 'mp4',
                                    'video/3gpp' => '3gp',
                                    'audio/ogg' => 'ogg',
                                    'audio/ogg; codecs=opus' => 'ogg', 
                                    'audio/mpeg' => 'mp3',
                                    'audio/aac' => 'aac',
                                    'audio/amr' => 'amr',
                                    'application/pdf' => 'pdf',
                                    'application/msword' => 'doc',
                                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx'
                                ];
                                
                                $extension = $mimeToExt[$mediaMimeType] ?? 'bin';
                                
                                // Forzar mp3 para compatibilidad con servidor
                                if ($type === 'audio' || $type === 'voice') {
                                    $extension = 'mp3';
                                }
                            }
                            
                            // Generar nombre de archivo
                            $prefix = [
                                'image' => 'img_',
                                'sticker' => 'stk_',
                                'video' => 'vid_',
                                'audio' => 'aud_',
                                'voice' => 'voz_',
                                'document' => 'doc_'
                            ][$type] ?? 'file_';
                            
                            $filename = $prefix . time() . '_' . uniqid() . '.' . $extension;
                            $filepath = $uploadDir . $filename;
                            
                            if (file_put_contents($filepath, $fileContent)) {
                                chmod($filepath, 0644);
                                $mediaUrlFinal = 'http://localhost/whatsApp/uploads/' . $carpetaTipo . '/' . $filename;
                                log_webhook("✓ Archivo guardado: {$mediaUrlFinal}");
                            } else {
                                log_webhook("✗ ERROR: No se pudo guardar el archivo");
                            }
                        } else {
                            log_webhook("✗ ERROR: No se pudo descargar archivo - HTTP {$httpCodeFile}");
                        }
                    } else {
                        log_webhook("✗ ERROR: No se obtuvo URL de descarga");
                    }
                } else {
                    log_webhook("✗ ERROR: No se pudo obtener metadata - HTTP {$httpCodeUrl}");
                }
            } else {
                log_webhook("⚠ No se puede descargar: falta mediaId o token");
            }
            
        } else {
            // Tipo no soportado
            $texto = "[" . strtoupper($type) . " - NO SOPORTADO]";
        }
        
        $phoneClean = preg_replace('/[^0-9]/', '', $from);
        $phone_safe = $conn_empresa->real_escape_string($phoneClean);
        $dateFormatted = date('Y-m-d H:i:s', $timestamp);
                
        // Verificar duplicado
        $msgId_clean = $conn_empresa->real_escape_string($msgId);
        $sqlDup = "SELECT id FROM fm_crm_whatsapp_messages 
                   WHERE message_id = '{$msgId_clean}' 
                   LIMIT 1";
        $resDup = $conn_empresa->query($sqlDup);
        
        if ($resDup && $resDup->num_rows > 0) {
            $existingId = $resDup->fetch_assoc()['id'];
            log_webhook("⚠ Mensaje duplicado - ID: {$existingId}");
            $conn_empresa->close();
            exit;
        }
        
        // INSERT
        log_webhook("Insertando mensaje en {$EMPR_BASEXX}...");
        
        $msgId_safe = $conn_empresa->real_escape_string($msgId);
        $type_safe = $conn_empresa->real_escape_string($type);
        $text_safe = $conn_empresa->real_escape_string($texto);
        $phoneId_safe = $conn_empresa->real_escape_string($phoneId);
        
        $accIdValue = $accountId ? intval($accountId) : "NULL";

        $contactName = $value['contacts'][0]['profile']['name'] ?? null;
        $contactName_safe = $contactName 
            ? "'" . $conn_empresa->real_escape_string($contactName) . "'" 
            : "NULL";

        $sqlContact = "INSERT INTO fm_crm_whatsapp_contacts 
                           (phone_number, wa_name, whatsapp_account_id)
                       VALUES 
                           ('{$phone_safe}', {$contactName_safe}, {$accIdValue})
                       ON DUPLICATE KEY UPDATE
                           wa_name    = IF(VALUES(wa_name) IS NOT NULL, VALUES(wa_name), wa_name),
                           updated_at = NOW()";

        if ($conn_empresa->query($sqlContact)) {
            log_webhook("✓ Contacto upserted: {$phoneClean} - " . ($contactName ?? 'sin nombre'));
        } else {
            log_webhook("✗ Error upsert contacto: " . $conn_empresa->error);
        }
        
        // Campos multimedia
        $mediaUrl_safe = $mediaUrlFinal ? "'" . $conn_empresa->real_escape_string($mediaUrlFinal) . "'" : "NULL";
        $mediaFilename_safe = $mediaFilename ? "'" . $conn_empresa->real_escape_string($mediaFilename) . "'" : "NULL";
        $mediaCaption_safe = $mediaCaption ? "'" . $conn_empresa->real_escape_string($mediaCaption) . "'" : "NULL";
        $mediaMimeType_safe = $mediaMimeType ? "'" . $conn_empresa->real_escape_string($mediaMimeType) . "'" : "NULL";
        
        $sqlInsert = "INSERT INTO fm_crm_whatsapp_messages (
            message_id, phone_number, direction, message_type, text_body,
            media_url, media_filename, media_caption, media_mime_type,
            status, whatsapp_account_id, phone_number_id,
            message_timestamp, message_date, created_at
        ) VALUES (
            '{$msgId_safe}', '{$phone_safe}', 'inbound', '{$type_safe}', '{$text_safe}',
            {$mediaUrl_safe}, {$mediaFilename_safe}, {$mediaCaption_safe}, {$mediaMimeType_safe},
            'delivered', {$accIdValue}, '{$phoneId_safe}',
            {$timestamp}, '{$dateFormatted}', NOW()
        )";
        
        $result = $conn_empresa->query($sqlInsert);
        
        if ($result) {
            $insertedId = $conn_empresa->insert_id;
            log_webhook("✓✓✓ ÉXITO: Mensaje guardado en {$EMPR_BASEXX} - ID: {$insertedId}");
        } else {
            log_webhook("✗✗✗ ERROR: INSERT falló en {$EMPR_BASEXX}");
            log_webhook("Error MySQL: " . $conn_empresa->error);
        }
        
        $conn_empresa->close();
        
    } catch (Exception $e) {
        log_webhook("EXCEPTION: " . $e->getMessage());
        if (isset($conn_empresa)) {
            $conn_empresa->close();
        }
    }
    
    exit;
}

// Sin mensajes ni estados
log_webhook("Payload sin mensajes ni estados");
log_webhook("========================================");
if (isset($conn_empresa)) {
    $conn_empresa->close();
}
exit;
?>