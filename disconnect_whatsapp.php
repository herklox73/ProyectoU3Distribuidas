<?php

// ✅ CAMBIO: Usar BD GENERAL
$objSql = new cSql;
$objEncrip = new cEncriptacion();
require_once("../../../clases/cParametros.php");
$objParam = new cParametros();
$digitador = $objEncrip->decrypt($_SESSION[$objParam->p_nombres_session]);

// ============================================
// SISTEMA DE LOGS
// ============================================
function writeLog($message, $type = 'INFO', $logFile = 'whatsapp_log.txt') {
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[{$timestamp}] [{$type}] {$message}\n";
    
    $logPath = __DIR__ . "/{$logFile}";
    file_put_contents($logPath, $logMessage, FILE_APPEND);
}

writeLog("=== INICIO DE DESCONEXIÓN DE WHATSAPP ===", 'INFO');
writeLog("Usuario: {$digitador}", 'INFO');

// ============================================
// DESACTIVAR CUENTA EN BASE DE DATOS
// ============================================

// Usamos phone_number_id de la sesión para desactivar el número específico
// así cualquier usuario de la empresa puede desconectar, no solo quien la conectó
$phone_number_id = $_SESSION['whatsapp_phone_id'] ?? null;

if (!$phone_number_id) {
    writeLog("ERROR: No hay phone_number_id en sesión", 'ERROR');
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No active WhatsApp session found']);
    exit;
}

$phone_id_safe = addslashes($phone_number_id);

$sql = "UPDATE fm_crm_whatsapp_accounts 
        SET is_active = 0,
            updated_at = NOW()
        WHERE phone_number_id = '{$phone_id_safe}'
        AND is_active = 1";

writeLog("Phone Number ID a desactivar: {$phone_number_id}", 'INFO');
writeLog("SQL Deactivate: {$sql}", 'INFO');

$result = $objSql->consulta($sql, "NO HISTORIAL");

if ($result) {
    writeLog("✅ Cuenta desactivada exitosamente en BD", 'INFO');
    
    // ============================================
    // LIMPIAR SESIÓN
    // ============================================
    unset($_SESSION['whatsapp_token']);
    unset($_SESSION['whatsapp_phone_id']);
    unset($_SESSION['whatsapp_number']);
    unset($_SESSION['whatsapp_waba_id']);
    unset($_SESSION['whatsapp_account_id']);
    unset($_SESSION['whatsapp_business_name']);
    unset($_SESSION['whatsapp_connected']);
    
    writeLog("✅ Sesión limpiada exitosamente", 'INFO');
    writeLog("=== DESCONEXIÓN COMPLETADA ===", 'INFO');
    
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'message' => 'WhatsApp disconnected successfully'
    ]);
    
} else {
    writeLog("ERROR: No se pudo desactivar la cuenta", 'ERROR');
    
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to disconnect WhatsApp account'
    ]);
}
?>
