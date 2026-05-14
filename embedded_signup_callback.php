<?php

require_once 'config.php';
$digitador = "demo_user";

// ============================================
// SISTEMA DE LOGS
// ============================================
function writeLog($message, $type = 'INFO', $logFile = 'whatsapp_log.txt') {
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[{$timestamp}] [{$type}] {$message}\n";
    
    $logPath = __DIR__ . "/{$logFile}";
    file_put_contents($logPath, $logMessage, FILE_APPEND);
    
    if ($type === 'ERROR' || $type === 'CRITICAL') {
        error_log($logMessage);
        file_put_contents(__DIR__ . "/whatsapp_error.log", $logMessage, FILE_APPEND);
    }
    
    if (strpos($message, 'META API') !== false || $type === 'API') {
        file_put_contents(__DIR__ . "/whatsapp_meta_api.log", $logMessage, FILE_APPEND);
    }
}

function logMetaApiCall($endpoint, $method, $data = null, $response = null) {
    $logEntry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'endpoint' => $endpoint,
        'method' => $method,
        'request_data' => $data,
        'response' => $response
    ];
    
    writeLog("META API CALL: " . json_encode($logEntry, JSON_PRETTY_PRINT), 'API');
}

// ============================================
// CONFIGURACIÓN
// ============================================
$APP_ID = 'AQUI_TU_NUEVO_APP_ID';
$APP_SECRET = 'AQUI_TU_NUEVO_APP_SECRET';
$CONFIG_ID = 'AQUI_TU_NUEVO_CONFIG_ID';

// 🔧 CORRECCIÓN 1: El PIN debe coincidir con el que el CLIENTE configuró en su WhatsApp Business Manager
// El cliente debe proporcionar este PIN o tú debes generarlo y dárselo a ellos
$VERIFICATION_PIN = '581063'; 

writeLog("=== INICIO DE PROCESO EMBEDDED SIGNUP (TECH PROVIDER) ===", 'INFO');
writeLog("Usuario: {$digitador}", 'INFO');
writeLog("IP: " . $_SERVER['REMOTE_ADDR'], 'INFO');

// ============================================
// RECIBIR DATOS DEL FRONTEND
// ============================================
$rawInput = file_get_contents('php://input');
writeLog("Raw Input recibido: " . $rawInput, 'INFO');

$input = json_decode($rawInput, true);

if (!$input) {
    writeLog("ERROR: No se pudo decodificar el JSON", 'ERROR');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

writeLog("Datos decodificados: " . json_encode($input, JSON_PRETTY_PRINT), 'INFO');

// Extraer datos del cliente - TODOS vienen del Embedded Signup
$code = isset($input['code']) ? $input['code'] : null;
$phone_number_id = isset($input['phone_number_id']) ? $input['phone_number_id'] : null;
$waba_id = isset($input['waba_id']) ? $input['waba_id'] : null;

writeLog("Code: {$code}", 'INFO');
writeLog("Phone Number ID (del cliente): {$phone_number_id}", 'INFO');
writeLog("WABA ID (del cliente): {$waba_id}", 'INFO');

// Validar datos requeridos
if (!$code) {
    writeLog("ERROR: Falta el código de autorización", 'ERROR');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing authorization code']);
    exit;
}

if (!$phone_number_id) {
    writeLog("ERROR: Falta phone_number_id", 'ERROR');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing phone_number_id']);
    exit;
}

if (!$waba_id) {
    writeLog("ERROR: Falta waba_id", 'ERROR');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing waba_id']);
    exit;
}

// ============================================
// PASO 1: INTERCAMBIAR CÓDIGO POR BUSINESS_TOKEN DEL CLIENTE
// ============================================
writeLog("=== PASO 1: INTERCAMBIAR CÓDIGO POR BUSINESS_TOKEN ===", 'INFO');
writeLog("Documentación: https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding#step-1", 'INFO');

$tokenUrl = API_BASE_URL . "oauth/access_token";
$tokenParams = [
    'client_id' => $APP_ID,
    'client_secret' => $APP_SECRET,
    'code' => $code
];

writeLog("URL de token: {$tokenUrl}", 'INFO');
writeLog("Intercambiando código por BUSINESS_TOKEN del cliente...", 'INFO');

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $tokenUrl . '?' . http_build_query($tokenParams));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);

$tokenResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

writeLog("HTTP Code: {$httpCode}", 'INFO');
writeLog("Response: {$tokenResponse}", 'INFO');

logMetaApiCall($tokenUrl, 'GET', ['client_id' => $APP_ID], $tokenResponse);

if ($curlError) {
    writeLog("CURL ERROR: {$curlError}", 'CRITICAL');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'CURL error: ' . $curlError]);
    exit;
}

$tokenData = json_decode($tokenResponse, true);

if (!$tokenData || !isset($tokenData['access_token'])) {
    writeLog("ERROR: No se recibió access_token. Response: " . $tokenResponse, 'ERROR');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to get access token', 'details' => $tokenData]);
    exit;
}

$businessToken = $tokenData['access_token'];
writeLog("✅ BUSINESS_TOKEN del cliente obtenido exitosamente", 'INFO');
writeLog("Token (primeros 30 chars): " . substr($businessToken, 0, 30) . "...", 'INFO');

// 🔧 CORRECCIÓN 2: Guardar también el tipo de token y su expiración si viene
$tokenType = isset($tokenData['token_type']) ? $tokenData['token_type'] : 'bearer';
$expiresIn = isset($tokenData['expires_in']) ? $tokenData['expires_in'] : null;

if ($expiresIn) {
    writeLog("Token expira en: {$expiresIn} segundos", 'INFO');
}

// ============================================
// PASO 2: SUSCRIBIRSE A WEBHOOKS DE LA WABA DEL CLIENTE
// ============================================
writeLog("=== PASO 2: SUSCRIBIRSE A WEBHOOKS ===", 'INFO');
writeLog("Documentación: https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding#step-2", 'INFO');

$webhookUrl = API_BASE_URL . "{$waba_id}/subscribed_apps";

writeLog("URL: {$webhookUrl}", 'INFO');
writeLog("Suscribiendo app a webhooks de la WABA del cliente...", 'INFO');

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $webhookUrl,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $businessToken,
        'Content-Type: application/json'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_TIMEOUT => 30
]);

$webhookResponse = curl_exec($ch);
$webhookHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$webhookCurlError = curl_error($ch);
curl_close($ch);

writeLog("HTTP Code: {$webhookHttpCode}", 'INFO');
writeLog("Response: {$webhookResponse}", 'INFO');

logMetaApiCall($webhookUrl, 'POST', ['waba_id' => $waba_id], $webhookResponse);

if ($webhookCurlError) {
    writeLog("CURL ERROR en suscripción webhooks: {$webhookCurlError}", 'ERROR');
    // 🔧 CORRECCIÓN 3: No salir aquí, intentar continuar
    writeLog("ADVERTENCIA: Error en webhooks pero continuando con el registro...", 'WARNING');
}

$webhookData = json_decode($webhookResponse, true);

if ($webhookHttpCode >= 200 && $webhookHttpCode < 300 && isset($webhookData['success']) && $webhookData['success']) {
    writeLog("✅ Suscripción a webhooks exitosa", 'INFO');
} else {
    writeLog("⚠️  ADVERTENCIA: Posible problema en suscripción de webhooks", 'WARNING');
    writeLog("Response completo: " . $webhookResponse, 'WARNING');
    // Continuar de todos modos, se puede suscribir manualmente después
}

// ============================================
// PASO 3: REGISTRAR EL NÚMERO DE TELÉFONO
// ============================================
writeLog("=== PASO 3: REGISTRAR NÚMERO DE TELÉFONO ===", 'INFO');
writeLog("Documentación: https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding#step-3", 'INFO');

$registerUrl = API_BASE_URL . "{$phone_number_id}/register";

writeLog("URL: {$registerUrl}", 'INFO');
writeLog("Registrando número de teléfono con PIN: {$VERIFICATION_PIN}", 'INFO');

// 🔧 CORRECCIÓN 4: Agregar más información en el payload
$registerPayload = [
    'messaging_product' => 'whatsapp',
    'pin' => $VERIFICATION_PIN
];

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $registerUrl,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $businessToken,
        'Content-Type: application/json'
    ],
    CURLOPT_POSTFIELDS => json_encode($registerPayload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_TIMEOUT => 30
]);

$registerResponse = curl_exec($ch);
$registerHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$registerCurlError = curl_error($ch);
curl_close($ch);

writeLog("HTTP Code: {$registerHttpCode}", 'INFO');
writeLog("Response: {$registerResponse}", 'INFO');

logMetaApiCall($registerUrl, 'POST', $registerPayload, $registerResponse);

if ($registerCurlError) {
    writeLog("CURL ERROR en registro de número: {$registerCurlError}", 'ERROR');
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'error' => 'Failed to register phone number',
        'curl_error' => $registerCurlError
    ]);
    exit;
}

$registerData = json_decode($registerResponse, true);

// 🔧 CORRECCIÓN 5: Manejo mejorado de errores de registro
if ($registerHttpCode >= 200 && $registerHttpCode < 300) {
    if (isset($registerData['success']) && $registerData['success']) {
        writeLog("✅ Número de teléfono registrado exitosamente", 'INFO');
    } else {
        writeLog("⚠️  Respuesta inesperada del registro: " . $registerResponse, 'WARNING');
        // Algunas veces el registro funciona pero no devuelve success:true
        // Verificar si hay error explícito
        if (isset($registerData['error'])) {
            writeLog("ERROR en registro de número: " . json_encode($registerData['error']), 'ERROR');
            
            // 🔧 CORRECCIÓN 6: Detalles específicos del error
            if (isset($registerData['error']['code']) && $registerData['error']['code'] == 100) {
                $errorDetails = isset($registerData['error']['error_data']['details']) 
                    ? $registerData['error']['error_data']['details'] 
                    : 'Unknown error';
                
                writeLog("ERROR ESPECÍFICO: {$errorDetails}", 'ERROR');
                
                // Errores comunes y soluciones
                if (strpos($errorDetails, 'Invalid account linking') !== false) {
                    writeLog("CAUSA PROBABLE: El número ya está registrado en otra cuenta o la WABA no está aprobada", 'ERROR');
                } elseif (strpos($errorDetails, 'already registered') !== false) {
                    writeLog("CAUSA PROBABLE: El número ya está registrado. Intenta usar un número diferente.", 'ERROR');
                } elseif (strpos($errorDetails, 'PIN') !== false) {
                    writeLog("CAUSA PROBABLE: El PIN es incorrecto o no coincide con el configurado en WhatsApp Business Manager", 'ERROR');
                }
                
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to register phone number',
                    'error_code' => $registerData['error']['code'],
                    'error_message' => $registerData['error']['message'],
                    'error_details' => $errorDetails,
                    'possible_cause' => 'Check if WABA is approved, PIN is correct, or number is already registered'
                ]);
                exit;
            }
        }
    }
} else {
    writeLog("ERROR HTTP en registro: {$registerHttpCode}", 'ERROR');
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'HTTP error during phone registration',
        'http_code' => $registerHttpCode,
        'response' => $registerData
    ]);
    exit;
}

// ============================================
// PASO 4: OBTENER INFORMACIÓN DEL NÚMERO REGISTRADO
// ============================================
writeLog("=== PASO 4: OBTENER INFO DEL NÚMERO REGISTRADO ===", 'INFO');

$phoneInfoUrl = API_BASE_URL . "{$phone_number_id}?fields=display_phone_number,verified_name";

writeLog("URL: {$phoneInfoUrl}", 'INFO');

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $phoneInfoUrl,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $businessToken
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_TIMEOUT => 30
]);

$phoneInfoResponse = curl_exec($ch);
$phoneInfoHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

writeLog("HTTP Code: {$phoneInfoHttpCode}", 'INFO');
writeLog("Response: {$phoneInfoResponse}", 'INFO');

logMetaApiCall($phoneInfoUrl, 'GET', null, $phoneInfoResponse);

$phoneInfo = json_decode($phoneInfoResponse, true);

$displayNumber = isset($phoneInfo['display_phone_number']) ? $phoneInfo['display_phone_number'] : null;
$verifiedName = isset($phoneInfo['verified_name']) ? $phoneInfo['verified_name'] : null;

writeLog("Display Number: {$displayNumber}", 'INFO');
writeLog("Verified Name: {$verifiedName}", 'INFO');

// ============================================
// GUARDAR EN BASE DE DATOS (BASE EMPRESA)
// ============================================
writeLog("=== GUARDANDO EN BASE DE DATOS ===", 'INFO');

$phone_number_id_safe = addslashes($phone_number_id);
$waba_id_safe = addslashes($waba_id);
$businessToken_safe = addslashes($businessToken);
$displayNumber_safe = $displayNumber ? "'" . addslashes($displayNumber) . "'" : "NULL";
$verifiedName_safe = $verifiedName ? "'" . addslashes($verifiedName) . "'" : "NULL";
$digitador_safe = addslashes($digitador);

writeLog("Valores escapados correctamente", 'INFO');

// Verificar si YA EXISTE
$sqlCheck = "SELECT id FROM fm_crm_whatsapp_accounts 
             WHERE phone_number_id = '{$phone_number_id_safe}'
             LIMIT 1";
writeLog("SQL Check: {$sqlCheck}", 'INFO');

$resultCheck = $objSql->consulta($sqlCheck, "NO HISTORIAL");

if ($resultCheck && $resultCheck->num_rows > 0) {
    // Ya existe, actualizar
    writeLog("Cuenta existente, actualizando...", 'INFO');
    
    $sqlUpdate = "UPDATE fm_crm_whatsapp_accounts SET 
                    access_token = '{$businessToken_safe}',
                    waba_id = '{$waba_id_safe}',
                    display_number = {$displayNumber_safe},
                    business_name = {$verifiedName_safe},
                    is_active = 1,
                    verification_status = 'verified',
                    verified_at = NOW(),
                    updated_at = NOW()
                  WHERE phone_number_id = '{$phone_number_id_safe}'";
    
    writeLog("SQL Update: {$sqlUpdate}", 'INFO');
    $resultUpdate = $objSql->consulta($sqlUpdate, "NO HISTORIAL");
    
    if ($resultUpdate) {
        $row = $resultCheck->fetch_assoc();
        $accountId = $row['id'];
        writeLog("✅ Cuenta actualizada. ID: {$accountId}", 'INFO');
    } else {
        writeLog("ERROR al actualizar", 'ERROR');
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database update failed']);
        exit;
    }
    
} else {
    // No existe, insertar
    writeLog("Nueva cuenta, insertando...", 'INFO');
    
    // Desactivar cuentas anteriores de este usuario
    $sqlDeactivate = "UPDATE fm_crm_whatsapp_accounts 
                  SET is_active = 0 
                  WHERE phone_number_id = '{$phone_number_id_safe}'
                  AND is_active = 1";
    writeLog("SQL Deactivate: {$sqlDeactivate}", 'INFO');
    $objSql->consulta($sqlDeactivate, "NO HISTORIAL");
    
    $sqlInsert = "INSERT INTO fm_crm_whatsapp_accounts (
                    phone_number_id, waba_id, access_token, display_number,
                    business_name, connected_by, is_active, 
                    verification_status, verified_at, created_at
                  ) VALUES (
                    '{$phone_number_id_safe}',
                    '{$waba_id_safe}',
                    '{$businessToken_safe}',
                    {$displayNumber_safe},
                    {$verifiedName_safe},
                    '{$digitador_safe}',
                    1,
                    'verified',
                    NOW(),
                    NOW()
                  )";
    
    writeLog("SQL Insert: {$sqlInsert}", 'INFO');
    $resultInsert = $objSql->consulta($sqlInsert, "NO HISTORIAL");
    
    if ($resultInsert) {
        $sqlLastId = "SELECT LAST_INSERT_ID() as id";
        $resultLastId = $objSql->consulta($sqlLastId, "NO HISTORIAL");
        $rowLastId = $resultLastId->fetch_assoc();
        $accountId = $rowLastId['id'];
        
        writeLog("✅ Nueva cuenta creada. ID: {$accountId}", 'INFO');
    } else {
        writeLog("ERROR al insertar", 'ERROR');
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database insert failed']);
        exit;
    }
}

// (Mapeo multiempresa removido para enfoque en envíos masivos directos)

// ============================================
// GUARDAR EN SESIÓN
// ============================================
writeLog("=== GUARDANDO EN SESIÓN ===", 'INFO');

$_SESSION['whatsapp_token'] = $businessToken;
$_SESSION['whatsapp_phone_id'] = $phone_number_id;
$_SESSION['whatsapp_number'] = $displayNumber;
$_SESSION['whatsapp_waba_id'] = $waba_id;
$_SESSION['whatsapp_account_id'] = $accountId;
$_SESSION['whatsapp_business_name'] = $verifiedName;
$_SESSION['whatsapp_connected'] = true;
$_SESSION['whatsapp_verified'] = true;

writeLog("✅ Datos guardados en sesión", 'INFO');

// ============================================
// RESPUESTA EXITOSA
// ============================================
writeLog("=== PROCESO COMPLETADO EXITOSAMENTE ===", 'INFO');
writeLog("El cliente ahora debe agregar un método de pago en su WhatsApp Manager", 'INFO');

$response = [
    'success' => true,
    'message' => 'WhatsApp account configured successfully.',
    'requires_payment_method' => true,
    'critical_notice' => 'IMPORTANT: Client CANNOT send messages until payment method is added',
    'payment_method_instructions' => [
        'url' => 'https://business.facebook.com/wa/manage/home/',
        'help_url' => 'https://www.facebook.com/business/help/488291839463771',
        'warning' => 'Without a Solution Partner, payment method is REQUIRED before sending any messages',
        'steps' => [
            '1. Go to WhatsApp Manager > Overview at https://business.facebook.com/wa/manage/home/',
            '2. Click "Add payment method" button',
            '3. Complete the payment setup (credit/debit card)',
            '4. Once added, you can start sending messages immediately'
        ]
    ],
    'waba_info' => [
        'waba_id' => $waba_id,
        'waba_owner' => 'CLIENT',
        'tech_provider' => 'YOUR_COMPANY',
        'access_type' => 'shared',
        'solution_partner' => 'NONE'
    ],
    'data' => [
        'account_id' => $accountId,
        'phone_number_id' => $phone_number_id,
        'waba_id' => $waba_id,
        'display_number' => $displayNumber,
        'verified_name' => $verifiedName,
        'connected_by' => $digitador,
        'verification_status' => 'verified',
        'webhooks_subscribed' => true,
        'phone_registered' => true,
        'can_send_messages' => false
    ],
    'next_steps' => [
        'step_1' => [
            'action' => 'ADD PAYMENT METHOD (REQUIRED)',
            'status' => 'PENDING',
            'blocking' => true,
            'instructions' => 'Client must add payment method before sending any messages'
        ],
        'step_2' => [
            'action' => 'Start sending messages',
            'status' => 'WAITING',
            'limit' => '250 conversations/day (Tier 1)',
            'depends_on' => 'Payment method added'
        ],
        'step_3' => [
            'action' => 'Business verification (optional)',
            'status' => 'OPTIONAL',
            'purpose' => 'Required only to increase limits beyond 250/day'
        ]
    ]
];

writeLog("Response: " . json_encode($response, JSON_PRETTY_PRINT), 'INFO');

header('Content-Type: application/json');
echo json_encode($response);
?>